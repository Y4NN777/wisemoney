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
import { isFinancialEventType, replaceAllEvents } from "@/domain/eventStore.ts";
import type { FinancialEventPayload, FinancialEventType } from "@/domain/eventStore.ts";
import { persistSnapshot, replayFromInception, validateDecryptedEventSequence } from "@/domain/financialState.ts";
import { loadCurrencyContext } from "@/domain/currencyStore.ts";
import { validateFinancialEventPayload } from "@/domain/eventPayload.ts";
import { convertMoney } from "@/types/money.ts";

const EXPORT_ARGON2_PARAMS = { memory: 65536, iterations: 3, parallelism: 2 } as const;
const MAX_IMPORT_BYTES = 100 * 1024 * 1024;

function encodeBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function decodeBase64(value: string, field: string): Uint8Array {
  let binary: string;
  try {
    binary = atob(value);
  } catch (error) {
    throw new Error(`importJSON: invalid ${field}`, { cause: error });
  }
  if (binary.length === 0) throw new Error(`importJSON: invalid ${field}`);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/** Coerce a value of unknown type to string for output. */
function str(val: unknown): string {
  if (typeof val === "string") return val;
  if (typeof val === "number") return String(val);
  return "";
}

function csvCell(value: unknown): string {
  const text = str(value);
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** The lossless export document structure. */
type WiseMoneyExport = {
  version: 1 | 2;
  exportedAt: number;
  financialEvents: Array<{
    id: string;
    timestamp: number;
    type: FinancialEventType;
    entityId: string;
    payload: FinancialEventPayload;
  }>;
  baseCurrency?: string;
  fxRates?: Array<{
    id: string;
    baseCurrency: string;
    quoteCurrency: string;
    rate: string;
    lastUpdated: number;
  }>;
};

async function readAllDecryptedEvents(masterKey: MasterKey): Promise<WiseMoneyExport["financialEvents"]> {
  const records = await db.financialEvents.orderBy("timestamp").toArray();
  const events: WiseMoneyExport["financialEvents"] = [];
  const decoder = new TextDecoder();
  for (let offset = 0; offset < records.length; offset += 32) {
    const batch = records.slice(offset, offset + 32);
    const decrypted = await Promise.all(batch.map(async (record) => {
      if (!isFinancialEventType(record.type)) {
        throw new Error(`exportJSON: unknown event type ${record.type}`);
      }
      const plaintext = await open({ ciphertext: record.ciphertext, iv: record.iv }, masterKey);
      try {
        return {
          id: record.id,
          timestamp: record.timestamp,
          type: record.type,
          entityId: record.entityId,
          payload: JSON.parse(decoder.decode(plaintext)) as FinancialEventPayload,
        };
      } finally {
        plaintext.fill(0);
      }
    }));
    events.push(...decrypted);
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
  const currencyContext = await loadCurrencyContext(masterKey, "XOF");
  const doc: WiseMoneyExport = {
    version: 2,
    exportedAt: Date.now(),
    financialEvents,
    baseCurrency: currencyContext.baseCurrency,
    fxRates: [...currencyContext.rates.values()].map((rate) => ({
      id: rate.id,
      baseCurrency: rate.baseCurrency,
      quoteCurrency: rate.quoteCurrency,
      rate: rate.rate,
      lastUpdated: rate.lastUpdated,
    })),
  };

  const json = JSON.stringify(doc, null, 2);
  const bytes = new TextEncoder().encode(json);

  if (encrypt) {
    if (exportPassphrase == null) {
      throw new Error("exportJSON: exportPassphrase required when encrypt=true");
    }
    const { masterKey: exportKey, salt } = await deriveMasterKey(exportPassphrase, EXPORT_ARGON2_PARAMS, null);
    let ciphertext: Uint8Array;
    let iv: Uint8Array;
    try {
      ({ ciphertext, iv } = await seal(bytes, exportKey));
    } finally {
      bytes.fill(0);
    }
    const envelope = JSON.stringify({
      version: 2,
      encoding: "base64",
      ciphertext: encodeBase64(ciphertext),
      iv: encodeBase64(iv),
      salt: encodeBase64(salt),
      params: EXPORT_ARGON2_PARAMS,
    });
    return new Blob([envelope], { type: "application/octet-stream" });
  }

  const blob = new Blob([bytes], { type: "application/json" });
  bytes.fill(0);
  return blob;
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
  if (blob.size > MAX_IMPORT_BYTES) {
    throw new Error("importJSON: file exceeds the 100 MB limit");
  }
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
    const salt = readEncodedBytes(obj.salt, "salt", 16);
    const iv = readEncodedBytes(obj.iv, "iv", 12);
    const ciphertext = readEncodedBytes(obj.ciphertext, "ciphertext");
    if (!hasExpectedExportParams(obj.params)) {
      throw new Error("importJSON: unsupported encrypted export parameters");
    }
    const params = EXPORT_ARGON2_PARAMS;
    const { masterKey: exportKey } = await deriveMasterKey(exportPassphrase, params, salt);
    const plaintext = await open({ ciphertext, iv }, exportKey);
    try {
      doc = JSON.parse(new TextDecoder().decode(plaintext)) as WiseMoneyExport;
    } finally {
      plaintext.fill(0);
    }
  } else {
    doc = obj as unknown as WiseMoneyExport;
  }

  doc = validateExportDocument(doc);
  try {
    validateDecryptedEventSequence(doc.financialEvents);
  } catch (error) {
    throw new Error("importJSON: financial event sequence is inconsistent", { cause: error });
  }

  const replacementRates = doc.version === 2
    ? doc.fxRates!.map((rate) => ({ ...rate, masterKey }))
    : undefined;
  const replacementEvents = doc.financialEvents.map((event) => ({
      id: event.id,
      timestamp: event.timestamp,
      type: event.type,
      entityId: event.entityId,
      payload: event.payload,
      masterKey,
  }));
  const replacementSetting = doc.version === 2
    ? { id: "baseCurrency", value: doc.baseCurrency!, masterKey }
    : undefined;
  if (replacementRates == null) {
    await replaceAllEvents(replacementEvents);
  } else {
    await replaceAllEvents(replacementEvents, replacementRates, replacementSetting);
  }

  const allEvents = await db.financialEvents.orderBy("timestamp").toArray();
  const currencyContext = await loadCurrencyContext(masterKey, "");
  const snapshot = await replayFromInception(allEvents, masterKey, Date.now(), currencyContext);
  await persistSnapshot(snapshot, masterKey);
}

function readEncodedBytes(value: unknown, field: string, exactLength?: number): Uint8Array {
  const bytes = typeof value === "string"
    ? decodeBase64(value, field)
    : Array.isArray(value) && value.length > 0 &&
      value.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255)
      ? Uint8Array.from(value as number[])
      : null;
  if (bytes == null) throw new Error(`importJSON: invalid ${field}`);
  if (exactLength != null && bytes.length !== exactLength) {
    throw new Error(`importJSON: invalid ${field} length`);
  }
  return bytes;
}

function hasExpectedExportParams(value: unknown): boolean {
  if (value == null || typeof value !== "object") return false;
  const params = value as Record<string, unknown>;
  return params.memory === EXPORT_ARGON2_PARAMS.memory &&
    params.iterations === EXPORT_ARGON2_PARAMS.iterations &&
    params.parallelism === EXPORT_ARGON2_PARAMS.parallelism;
}

function validateExportDocument(value: unknown): WiseMoneyExport {
  if (value == null || typeof value !== "object") {
    throw new Error("importJSON: invalid export structure");
  }
  const candidate = value as Partial<WiseMoneyExport>;
  if ((candidate.version !== 1 && candidate.version !== 2) || !Number.isSafeInteger(candidate.exportedAt) ||
      !Array.isArray(candidate.financialEvents)) {
    throw new Error("importJSON: invalid export structure");
  }

  const ids = new Set<string>();
  for (const event of candidate.financialEvents) {
    if (event == null || typeof event !== "object" ||
        typeof event.id !== "string" || event.id.length === 0 || ids.has(event.id) ||
        !Number.isSafeInteger(event.timestamp) || event.timestamp < 0 ||
        !isFinancialEventType(event.type) ||
        typeof event.entityId !== "string" || event.entityId.length === 0 ||
        event.payload == null || typeof event.payload !== "object" || Array.isArray(event.payload)) {
      throw new Error("importJSON: invalid financial event");
    }
    try {
      validateFinancialEventPayload(event.type, event.payload);
    } catch (error) {
      throw new Error(`importJSON: invalid payload for event ${event.id}`, { cause: error });
    }
    ids.add(event.id);
  }

  if (candidate.version === 2) {
    if (typeof candidate.baseCurrency !== "string" || !/^[A-Z]{3}$/.test(candidate.baseCurrency) ||
        !Array.isArray(candidate.fxRates)) {
      throw new Error("importJSON: invalid currency settings");
    }
    const rateIds = new Set<string>();
    for (const rate of candidate.fxRates) {
      if (rate == null || typeof rate !== "object" ||
          typeof rate.baseCurrency !== "string" || !/^[A-Z]{3}$/.test(rate.baseCurrency) ||
          typeof rate.quoteCurrency !== "string" || !/^[A-Z]{3}$/.test(rate.quoteCurrency) ||
          rate.baseCurrency === rate.quoteCurrency ||
          rate.id !== `${rate.baseCurrency}/${rate.quoteCurrency}` || rateIds.has(rate.id) ||
          typeof rate.rate !== "string" || !Number.isSafeInteger(rate.lastUpdated) || rate.lastUpdated < 0) {
        throw new Error("importJSON: invalid FX rate");
      }
      try {
        convertMoney({ minorUnits: 1, currency: rate.baseCurrency }, rate.quoteCurrency, rate.rate);
      } catch (error) {
        throw new Error(`importJSON: invalid FX rate ${rate.id}`, { cause: error });
      }
      rateIds.add(rate.id);
    }
  }

  return candidate as WiseMoneyExport;
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

  const header = "id,timestamp,type,entityId,payload";
  const rows = events.map((event) => {
    return [
      event.id,
      new Date(event.timestamp).toISOString(),
      event.type,
      event.entityId,
      JSON.stringify(event.payload),
    ].map(csvCell).join(",");
  });

  const csv = [header, ...rows].join("\n");
  return new Blob([csv], { type: "text/csv" });
}

/**
 * Export a human-readable XLSX summary.
 *
 * INV-PERS-04: same restrictions as exportCSV.
 * Uses write-excel-file to emit a real zipped OOXML workbook in the browser.
 */
export async function exportXLSX(
  masterKey: MasterKey
): Promise<Blob> {
  const events = await readAllDecryptedEvents(masterKey);
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  const header = ["id", "timestamp", "type", "entityId", "payload"]
    .map((value) => ({ value, fontWeight: "bold" as const }));
  const rows = events.map((event) => [
    event.id,
    new Date(event.timestamp).toISOString(),
    event.type,
    event.entityId,
    JSON.stringify(event.payload),
  ]);
  const workbook = writeXlsxFile([header, ...rows], {
    sheet: "Transactions",
    columns: [
      { width: 38 }, { width: 25 }, { width: 30 }, { width: 38 }, { width: 80 },
    ],
  });
  return workbook.toBlob();
}
