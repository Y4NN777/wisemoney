/**
 * Export / Import module.
 *
 * INV-PERS-03: JSON export is lossless. Importing a JSON export reconstructs
 * the exact local state including the full event log, all entity references,
 * and all account/category/goal/budget records.
 *
 * INV-PERS-04: CSV and XLSX are human-readable summaries. They are NOT restore
 * formats and MUST NOT be presented to the user as backups.
 *
 * DQ-03 (resolved 2026-06-02): the lossless JSON export carries DECRYPTED payloads,
 * not ciphertext blobs. keyMeta (salt/KDF params/WebAuthn handle/wrappedKey) is
 * NOT included — it is regenerated on the target device at import time.
 * BYO provider key material is excluded from plaintext export.
 *
 * FR-PERSIST-08: optional passphrase-encrypted export wraps the plaintext JSON in
 * an additional AES-GCM envelope under a user-supplied export passphrase.
 *
 * WARN the user at export time that a plaintext JSON export exposes all financial
 * data in plaintext (M-EXPORT-01).
 */

import type { MasterKey } from "@/crypto/envelope.ts";
import { open, seal } from "@/crypto/envelope.ts";
import { db } from "@/db/schema.ts";
import { deriveMasterKey } from "@/crypto/keyManagement.ts";
import { appendEvent } from "@/domain/eventStore.ts";
import { replayFromInception } from "@/domain/financialState.ts";

const EXPORT_ARGON2_PARAMS = { memory: 65536, iterations: 3, parallelism: 2 } as const;

/** Coerce a value of unknown type to string for output. */
function str(val: unknown): string {
  if (typeof val === "string") return val;
  if (typeof val === "number") return String(val);
  return "";
}

/** The lossless export document structure. */
export type WiseMoneyExport = {
  version: 1;
  exportedAt: number;
  financialEvents: Array<{
    id: string;
    timestamp: number;
    type: string;
    entityId: string;
    payload: unknown;
  }>;
};

async function readAllDecryptedEvents(masterKey: MasterKey): Promise<WiseMoneyExport["financialEvents"]> {
  const records = await db.financialEvents.orderBy("timestamp").toArray();
  const events: WiseMoneyExport["financialEvents"] = [];
  for (const record of records) {
    const plaintext = await open({ ciphertext: record.ciphertext, iv: record.iv }, masterKey);
    const payload = JSON.parse(new TextDecoder().decode(plaintext)) as Record<string, unknown>;
    events.push({
      id: record.id,
      timestamp: record.timestamp,
      type: record.type,
      entityId: record.entityId,
      payload,
    });
  }
  return events;
}

/**
 * Export all financial data as a lossless JSON blob (INV-PERS-03).
 *
 * Reads all events from IndexedDB, decrypts each with the master key,
 * and serialises as a WiseMoneyExport document.
 *
 * If `encrypt` is true (FR-PERSIST-08): derive a wrapping key from
 * `exportPassphrase` via Argon2id and AES-GCM-seal the JSON document.
 *
 * @param masterKey       - session master key for decrypting the store
 * @param encrypt         - if true, wrap with exportPassphrase (FR-PERSIST-08)
 * @param exportPassphrase - required if encrypt is true
 */
export async function exportJSON(
  masterKey: MasterKey,
  encrypt: boolean,
  exportPassphrase?: string
): Promise<Blob> {
  const financialEvents = await readAllDecryptedEvents(masterKey);
  const doc: WiseMoneyExport = {
    version: 1,
    exportedAt: Date.now(),
    financialEvents,
  };

  const json = JSON.stringify(doc, null, 2);
  const bytes = new TextEncoder().encode(json);

  if (encrypt) {
    if (exportPassphrase == null) {
      throw new Error("exportJSON: exportPassphrase required when encrypt=true");
    }
    const { masterKey: exportKey, salt } = await deriveMasterKey(exportPassphrase, EXPORT_ARGON2_PARAMS, null);
    const { ciphertext, iv } = await seal(bytes, exportKey);
    const envelope = JSON.stringify({
      ciphertext: Array.from(ciphertext),
      iv: Array.from(iv),
      salt: Array.from(salt),
      params: EXPORT_ARGON2_PARAMS,
    });
    return new Blob([envelope], { type: "application/octet-stream" });
  }

  return new Blob([json], { type: "application/json" });
}

/**
 * Import a JSON export and restore local state.
 *
 * If passphrase-encrypted (FR-PERSIST-08): decrypt with exportPassphrase first.
 * Validates the WiseMoneyExport structure, clears existing data, re-encrypts all
 * events under the current device's master key, and triggers a full replay.
 *
 * @param blob            - the export Blob (plain or encrypted JSON)
 * @param masterKey       - current device's session master key
 * @param exportPassphrase - required if the export is passphrase-encrypted
 */
export async function importJSON(
  blob: Blob,
  masterKey: MasterKey,
  exportPassphrase?: string
): Promise<void> {
  let doc: WiseMoneyExport;
  const raw = await blob.text();

  // Try parsing as encrypted envelope first
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("importJSON: invalid JSON");
  }

  const obj = parsed as Record<string, unknown>;
  if (obj != null && typeof obj === "object" && "ciphertext" in obj && "iv" in obj) {
    if (exportPassphrase == null) {
      throw new Error("importJSON: exportPassphrase required for encrypted export");
    }
    const salt = new Uint8Array((obj.salt as number[]) ?? []);
    const params = (obj.params as typeof EXPORT_ARGON2_PARAMS) ?? EXPORT_ARGON2_PARAMS;
    const { masterKey: exportKey } = await deriveMasterKey(exportPassphrase, params, salt);
    const ciphertext = new Uint8Array((obj.ciphertext as number[]) ?? []);
    const iv = new Uint8Array((obj.iv as number[]) ?? []);
    const plaintext = await open({ ciphertext, iv }, exportKey);
    doc = JSON.parse(new TextDecoder().decode(plaintext)) as WiseMoneyExport;
  } else {
    doc = obj as unknown as WiseMoneyExport;
  }

  if (doc == null || typeof doc !== "object" || doc.version !== 1 || !Array.isArray(doc.financialEvents)) {
    throw new Error("importJSON: invalid export structure");
  }

  // Clear existing data — preserve system stores (keyMeta, byoProviderKeys, authSession).
  // Projection stores are rebuilt during replay (INV-EVT-02).
  const dataTables = db.tables.filter(
    (t) => t.name !== "keyMeta" && t.name !== "byoProviderKeys" && t.name !== "authSession"
  );
  await Promise.all(dataTables.map((t) => t.clear()));

  // Re-encrypt and write each event under the current master key
  for (const event of doc.financialEvents) {
    await appendEvent({
      id: event.id,
      timestamp: event.timestamp,
      type: event.type as never,
      entityId: event.entityId,
      payload: event.payload as Record<string, unknown>,
      masterKey,
    });
  }

  // Trigger full replay to rebuild projection stores
  const allEvents = await db.financialEvents.orderBy("timestamp").toArray();
  await replayFromInception(allEvents, masterKey);
}

/**
 * Export a human-readable CSV summary.
 *
 * INV-PERS-04: this is NOT a restore format.
 */
export async function exportCSV(
  masterKey: MasterKey
): Promise<Blob> {
  const events = await readAllDecryptedEvents(masterKey);
  const txEvents = events.filter((e) => e.type === "transaction_created");

  const header = "id,timestamp,type,entityId,categoryId,amount,currency,direction,note";
  const rows = txEvents.map((e) => {
    const p = e.payload as Record<string, unknown>;
    const amount = p.amount as Record<string, unknown> | undefined;
    return [
      e.id,
      new Date(e.timestamp).toISOString(),
      e.type,
      e.entityId,
      str(p.categoryId),
      str(amount?.minorUnits),
      str(amount?.currency),
      str(p.direction),
      str(p.note),
    ].map((v) => `"${v.replace(/"/g, '""')}"`).join(",");
  });

  const csv = [header, ...rows].join("\n");
  return new Blob([csv], { type: "text/csv" });
}

/**
 * Export a human-readable XLSX summary.
 *
 * INV-PERS-04: same restrictions as exportCSV.
 * Uses a minimal XLSX builder without external dependencies.
 */
export async function exportXLSX(
  masterKey: MasterKey
): Promise<Blob> {
  const events = await readAllDecryptedEvents(masterKey);
  const txEvents = events.filter((e) => e.type === "transaction_created");

  // Build a minimal HTML table-based XLSX (Excel opens .xls HTML)
  const rows = txEvents.map((e) => {
    const p = e.payload as Record<string, unknown>;
    const amount = p.amount as Record<string, unknown> | undefined;
    return `<tr>
      <td>${e.id}</td>
      <td>${new Date(e.timestamp).toISOString()}</td>
      <td>${e.type}</td>
      <td>${str(p.categoryId)}</td>
      <td>${str(amount?.minorUnits)}</td>
      <td>${str(amount?.currency)}</td>
      <td>${str(p.direction)}</td>
      <td>${str(p.note)}</td>
    </tr>`;
  }).join("\n");

  const html = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:x="urn:schemas-microsoft-com:office:excel"
      xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="UTF-8"></head>
<body><table>
<tr><th>id</th><th>timestamp</th><th>type</th><th>categoryId</th><th>amount</th><th>currency</th><th>direction</th><th>note</th></tr>
${rows}
</table></body></html>`;

  return new Blob([html], { type: "application/vnd.ms-excel" });
}
