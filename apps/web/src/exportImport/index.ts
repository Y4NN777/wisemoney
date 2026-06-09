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

/** The lossless export document structure. */
export type WiseMoneyExport = {
  version: 1;
  exportedAt: number; // Unix ms UTC
  // Decrypted payload per data-model.md DQ-03 resolution:
  financialEvents: unknown[];    // TODO: type with FinancialEventPayload[]
  accounts: unknown[];
  transactions: unknown[];
  categories: unknown[];
  budgets: unknown[];
  goals: unknown[];
  goalContributions: unknown[];
  recurringItems: unknown[];
  fxRates: unknown[];
  // keyMeta is excluded — regenerated on target device.
  // byoProviderKeys excluded from plaintext export (user re-enters on new device).
};

/**
 * Export all financial data as a lossless JSON blob (INV-PERS-03).
 *
 * TODO (FR-PERSIST-05, DQ-03):
 * - Decrypt all IndexedDB records using the session masterKey.
 * - Build a WiseMoneyExport document (decrypted payloads — DQ-03 resolution).
 * - If `encrypt` is true (FR-PERSIST-08): derive a wrapping key from
 *   `exportPassphrase` via Argon2id and AES-GCM-seal the JSON document.
 * - WARN the user (UI responsibility) that plaintext export exposes all data.
 * - Return the resulting Blob for download.
 *
 * @param masterKey       - session master key for decrypting the store
 * @param encrypt         - if true, wrap with exportPassphrase (FR-PERSIST-08)
 * @param exportPassphrase - required if encrypt is true
 */
export function exportJSON(
  _masterKey: MasterKey,
  _encrypt: boolean,
  _exportPassphrase?: string
): Promise<Blob> {
  // TODO: implement lossless decrypted export
  return Promise.reject(new Error("exportJSON: not yet implemented"));
}

/**
 * Import a JSON export and restore local state.
 *
 * TODO (INV-PERS-03):
 * - If passphrase-encrypted (FR-PERSIST-08): decrypt with exportPassphrase first.
 * - Validate the WiseMoneyExport version and structure.
 * - Re-encrypt all payloads under the current device's master key and write to IndexedDB.
 * - Trigger a full replay to rebuild projection stores and the snapshot.
 * - On any validation error, abort without writing (atomic restore).
 *
 * @param blob            - the export Blob (plain or encrypted JSON)
 * @param masterKey       - current device's session master key
 * @param exportPassphrase - required if the export is passphrase-encrypted
 */
export function importJSON(
  _blob: Blob,
  _masterKey: MasterKey,
  _exportPassphrase?: string
): Promise<void> {
  // TODO: implement
  return Promise.reject(new Error("importJSON: not yet implemented"));
}

/**
 * Export a human-readable CSV summary.
 *
 * INV-PERS-04: this is NOT a restore format. The UI MUST NOT present this as
 * a backup. Display a clear disclaimer at download time.
 *
 * TODO (FR-PERSIST-06): implement CSV serialisation of the decrypted transaction
 * ledger. Column layout is a UI-layer decision (may change freely per CONTRACT §8).
 */
export function exportCSV(
  _masterKey: MasterKey
): Promise<Blob> {
  // TODO: implement
  return Promise.reject(new Error("exportCSV: not yet implemented"));
}

/**
 * Export a human-readable XLSX summary.
 *
 * INV-PERS-04: same restrictions as exportCSV.
 *
 * TODO (FR-PERSIST-06): implement XLSX serialisation. Consider SheetJS (xlsx)
 * as the library — run /dep-audit before adding it.
 */
export function exportXLSX(
  _masterKey: MasterKey
): Promise<Blob> {
  // TODO: implement
  return Promise.reject(new Error("exportXLSX: not yet implemented"));
}
