import { useState, useRef, type FormEvent } from "react";
import { useMasterKey } from "../../lib/masterKeyContext.ts";
import { exportJSON, exportCSV, exportXLSX, importJSON } from "../../exportImport/index.ts";
import { Button } from "../../components/ui/button.tsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card.tsx";
import { Input } from "../../components/ui/input.tsx";
import { Label } from "../../components/ui/label.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../../components/ui/dialog.tsx";
import { Download, Upload, AlertTriangle, Loader2, FileDown } from "lucide-react";
import { useTranslation } from "react-i18next";

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function ExportImportSection() {
  const { t } = useTranslation();
  const masterKey = useMasterKey();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [exporting, setExporting] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const [showPassphraseDialog, setShowPassphraseDialog] = useState<"export" | "import" | null>(null);
  const [passphrase, setPassphrase] = useState("");
  const [passphraseError, setPassphraseError] = useState<string | null>(null);

  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ ok: boolean; message: string } | null>(null);

  const handleExport = async (format: "json" | "csv" | "xlsx") => {
    setExportError(null);
    setExporting(format);
    try {
      let blob: Blob;
      let filename: string;
      switch (format) {
        case "json": {
          blob = await exportJSON(masterKey, false);
          filename = `wisemoney-export-${Date.now()}.json`;
          break;
        }
        case "csv": {
          blob = await exportCSV(masterKey);
          filename = `wisemoney-transactions-${Date.now()}.csv`;
          break;
        }
        case "xlsx": {
          blob = await exportXLSX(masterKey);
          filename = `wisemoney-transactions-${Date.now()}.xls`;
          break;
        }
      }
      downloadBlob(blob, filename);
    } catch {
      setExportError(t("exportImport.export.errors.failed"));
    } finally {
      setExporting(null);
    }
  };

  const handleEncryptedExport = async () => {
    if (!passphrase || passphrase.length < 4) {
      setPassphraseError(t("exportImport.passphrase.errors.tooShort"));
      return;
    }
    setPassphraseError(null);
    setExporting("json-encrypted");
    try {
      const blob = await exportJSON(masterKey, true, passphrase);
      downloadBlob(blob, `wisemoney-encrypted-${Date.now()}.wmexport`);
      setShowPassphraseDialog(null);
      setPassphrase("");
    } catch {
      setExportError(t("exportImport.export.errors.encryptedFailed"));
    } finally {
      setExporting(null);
    }
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file == null) return;
    setImportResult(null);
    setImportError(null);

    // Reset the input so the same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = "";

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Record<string, unknown>;
      if (parsed != null && typeof parsed === "object" && "ciphertext" in parsed && "iv" in parsed) {
        // Encrypted export — need passphrase
        setPassphrase("");
        setPassphraseError(null);
        setShowPassphraseDialog("import");
        return;
      }
      // Plain JSON — import directly
      await doImport(text);
    } catch {
      setImportResult({ ok: false, message: t("exportImport.import.errors.invalidFile") });
    }
  };

  const handleEncryptedImport = async () => {
    if (!passphrase || passphrase.length === 0) {
      setPassphraseError(t("exportImport.passphrase.errors.required"));
      return;
    }
    setPassphraseError(null);
    await doImport(null, passphrase);
    setShowPassphraseDialog(null);
    setPassphrase("");
  };

  const [importError, setImportError] = useState<string | null>(null);

  const doImport = async (text?: string | null, exportPassphrase?: string) => {
    setImporting(true);
    setImportError(null);
    try {
      let blob: Blob;
      if (text != null) {
        blob = new Blob([text], { type: "application/json" });
      } else {
        const file = fileInputRef.current?.files?.[0];
        if (file == null) throw new Error(t("exportImport.import.errors.noFile"));
        blob = file;
      }
      await importJSON(blob, masterKey, exportPassphrase);
      setImportResult({ ok: true, message: t("exportImport.import.success") });
    } catch {
      setImportError(t("exportImport.import.errors.failed"));
    } finally {
      setImporting(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            {t("exportImport.export.title")}
          </CardTitle>
          <CardDescription>
            {t("exportImport.export.description")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {exportError != null && (
            <p role="alert" className="text-destructive text-sm">{exportError}</p>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => { void handleExport("json"); }}
              disabled={exporting != null}
            >
              {exporting === "json" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <FileDown className="h-4 w-4 mr-1" />}
              {t("exportImport.export.json")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowPassphraseDialog("export")}
              disabled={exporting != null}
            >
              {exporting === "json-encrypted" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <FileDown className="h-4 w-4 mr-1" />}
              {t("exportImport.export.encrypted")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { void handleExport("csv"); }}
              disabled={exporting != null}
            >
              {exporting === "csv" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <FileDown className="h-4 w-4 mr-1" />}
              {t("exportImport.export.csv")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { void handleExport("xlsx"); }}
              disabled={exporting != null}
            >
              {exporting === "xlsx" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <FileDown className="h-4 w-4 mr-1" />}
              {t("exportImport.export.xlsx")}
            </Button>
          </div>

          <div className="flex items-start gap-2 rounded-md border border-amber bg-amber-wash p-3">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700 dark:text-amber-400">{t("exportImport.export.warning")}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            {t("exportImport.import.title")}
          </CardTitle>
          <CardDescription>
            {t("exportImport.import.description")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {importError != null && (
            <p role="alert" className="text-destructive text-sm">{importError}</p>
          )}
          {importResult != null && (
            <p role="alert" className={importResult.ok ? "text-green-600 text-sm" : "text-destructive text-sm"}>
              {importResult.message}
            </p>
          )}
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.wmexport"
              onChange={(e) => { void handleFileSelected(e); }}
              className="block w-full text-sm text-muted-foreground
                file:mr-3 file:py-2 file:px-4
                file:rounded-md file:border-0
                file:text-sm file:font-medium
                file:bg-primary file:text-primary-foreground
                hover:file:bg-primary/90
                cursor-pointer"
              disabled={importing}
            />
          </div>
          {importing && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("exportImport.import.importing")}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Passphrase dialog for encrypted export/import */}
      <Dialog
        open={showPassphraseDialog != null}
        onOpenChange={(open) => {
          if (!open) {
            setShowPassphraseDialog(null);
            setPassphrase("");
            setPassphraseError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {showPassphraseDialog === "export" ? t("exportImport.passphrase.exportTitle") : t("exportImport.passphrase.importTitle")}
            </DialogTitle>
            <DialogDescription>
              {showPassphraseDialog === "export"
                ? t("exportImport.passphrase.exportDescription")
                : t("exportImport.passphrase.importDescription")}
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              if (showPassphraseDialog === "export") {
                void handleEncryptedExport();
              } else {
                void handleEncryptedImport();
              }
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="export-passphrase">{t("exportImport.passphrase.label")}</Label>
              <Input
                id="export-passphrase"
                type="password"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                required
                autoFocus
                minLength={showPassphraseDialog === "export" ? 4 : 1}
              />
              {passphraseError != null && (
                <p className="text-destructive text-xs">{passphraseError}</p>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowPassphraseDialog(null);
                  setPassphrase("");
                  setPassphraseError(null);
                }}
              >
                {t("exportImport.passphrase.cancel")}
              </Button>
              <Button type="submit" disabled={exporting != null || importing}>
                {(exporting != null || importing) ? (
                  <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> {t("exportImport.passphrase.processing")}</>
                ) : showPassphraseDialog === "export" ? (
                  t("exportImport.passphrase.encryptDownload")
                ) : (
                  t("exportImport.passphrase.decryptImport")
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
