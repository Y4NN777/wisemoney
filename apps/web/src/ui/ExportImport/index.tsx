import { useEffect, useState, useRef, type FormEvent } from "react";
import { useMasterKey } from "../../lib/masterKeyContext.ts";
import { exportJSON, exportCSV, exportXLSX, importJSON } from "../../exportImport/index.ts";
import { closeFinancialCycle, getCycleOverview, prepareCycleArchive, readCycleHistory, type CycleArchiveReceipt, type CycleOverview, type PreparedCycleArchive } from "../../exportImport/cycle.ts";
import { Button } from "../../components/ui/button.tsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card.tsx";
import { Input } from "../../components/ui/input.tsx";
import { Label } from "../../components/ui/label.tsx";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "../../components/ui/dialog.tsx";
import { Download, Upload, AlertTriangle, Loader2, FileDown, Archive, CheckCircle2, FileSpreadsheet, History, RotateCcw, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { seedDefaultCategories } from "../../pillars/state/index.ts";
import { markCoachBackupCreated } from "../../coach/CoachProvider.tsx";

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function formatCycleDate(timestamp: number | null, locale: string): string {
  if (timestamp == null) return "—";
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(timestamp);
}

export default function ExportImportSection() {
  const { t } = useTranslation();
  const masterKey = useMasterKey();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [cycleOverview, setCycleOverview] = useState<CycleOverview | null>(null);
  const [cycleHistory, setCycleHistory] = useState<CycleArchiveReceipt[]>([]);
  const [cycleDialogOpen, setCycleDialogOpen] = useState(false);
  const [cycleLabel, setCycleLabel] = useState("");
  const [cyclePassphrase, setCyclePassphrase] = useState("");
  const [cyclePassphraseConfirmation, setCyclePassphraseConfirmation] = useState("");
  const [cycleError, setCycleError] = useState<string | null>(null);
  const [preparingCycle, setPreparingCycle] = useState(false);
  const [preparedCycle, setPreparedCycle] = useState<PreparedCycleArchive | null>(null);
  const [downloadedCycleFiles, setDownloadedCycleFiles] = useState({ backup: false, report: false });
  const [savedFilesConfirmed, setSavedFilesConfirmed] = useState(false);
  const [resetConfirmation, setResetConfirmation] = useState("");
  const [resettingCycle, setResettingCycle] = useState(false);

  const [exporting, setExporting] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const [showPassphraseDialog, setShowPassphraseDialog] = useState<"export" | "import" | null>(null);
  const [passphrase, setPassphrase] = useState("");
  const [passphraseError, setPassphraseError] = useState<string | null>(null);

  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pendingEncryptedImportText, setPendingEncryptedImportText] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.all([getCycleOverview(), readCycleHistory(masterKey)])
      .then(([overview, history]) => {
        if (!active) return;
        setCycleOverview(overview);
        setCycleHistory(history);
      })
      .catch(() => {
        if (active) setCycleError(t("exportImport.cycle.errors.loadFailed"));
      });
    return () => { active = false; };
  }, [masterKey, t]);

  const resetCycleDialog = () => {
    setCycleDialogOpen(false);
    setCycleLabel("");
    setCyclePassphrase("");
    setCyclePassphraseConfirmation("");
    setCycleError(null);
    setPreparedCycle(null);
    setDownloadedCycleFiles({ backup: false, report: false });
    setSavedFilesConfirmed(false);
    setResetConfirmation("");
  };

  const handlePrepareCycle = async (event: FormEvent) => {
    event.preventDefault();
    setCycleError(null);
    if (cycleLabel.trim().length === 0) {
      setCycleError(t("exportImport.cycle.errors.labelRequired"));
      return;
    }
    if (cyclePassphrase.length < 8) {
      setCycleError(t("exportImport.cycle.errors.passphraseTooShort"));
      return;
    }
    if (cyclePassphrase !== cyclePassphraseConfirmation) {
      setCycleError(t("exportImport.cycle.errors.passphraseMismatch"));
      return;
    }
    setPreparingCycle(true);
    try {
      const prepared = await prepareCycleArchive(masterKey, cycleLabel, cyclePassphrase, {
        locale: document.documentElement.lang || "en",
      });
      setPreparedCycle(prepared);
      setCyclePassphrase("");
      setCyclePassphraseConfirmation("");
      toast.success(t("exportImport.cycle.prepared"));
    } catch {
      const message = t("exportImport.cycle.errors.prepareFailed");
      setCycleError(message);
      toast.error(message);
    } finally {
      setPreparingCycle(false);
    }
  };

  const handleCycleDownload = (kind: "backup" | "report") => {
    if (preparedCycle == null) return;
    if (kind === "backup") {
      downloadBlob(preparedCycle.backup, preparedCycle.backupFilename);
      markCoachBackupCreated();
    } else {
      downloadBlob(preparedCycle.report, preparedCycle.reportFilename);
    }
    setDownloadedCycleFiles((current) => ({ ...current, [kind]: true }));
  };

  const handleCycleReset = async () => {
    if (preparedCycle == null || !downloadedCycleFiles.backup || !downloadedCycleFiles.report ||
        !savedFilesConfirmed || resetConfirmation !== "RESET") return;
    setCycleError(null);
    setResettingCycle(true);
    try {
      await closeFinancialCycle(masterKey, preparedCycle);
      await seedDefaultCategories(masterKey);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["financialState"] }),
        queryClient.invalidateQueries({ queryKey: ["transactions"] }),
      ]);
      const [overview, history] = await Promise.all([getCycleOverview(), readCycleHistory(masterKey)]);
      setCycleOverview(overview);
      setCycleHistory(history);
      resetCycleDialog();
      toast.success(t("exportImport.cycle.resetSuccess"));
    } catch (error) {
      const changed = error instanceof Error && error.message.includes("data changed");
      const message = t(changed ? "exportImport.cycle.errors.dataChanged" : "exportImport.cycle.errors.resetFailed");
      setCycleError(message);
      toast.error(message);
    } finally {
      setResettingCycle(false);
    }
  };

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
          filename = `wisemoney-transactions-${Date.now()}.xlsx`;
          break;
        }
      }
      downloadBlob(blob, filename);
      markCoachBackupCreated();
      toast.success(t("exportImport.export.success"), { description: filename });
    } catch {
      const message = t("exportImport.export.errors.failed");
      setExportError(message);
      toast.error(message);
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
      markCoachBackupCreated();
      setShowPassphraseDialog(null);
      setPassphrase("");
      toast.success(t("exportImport.export.encryptedSuccess"));
    } catch {
      const message = t("exportImport.export.errors.encryptedFailed");
      setExportError(message);
      toast.error(message);
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
        setPendingEncryptedImportText(text);
        setPassphrase("");
        setPassphraseError(null);
        setShowPassphraseDialog("import");
        return;
      }
      // Plain JSON — import directly
      await doImport(text);
    } catch {
      const message = t("exportImport.import.errors.invalidFile");
      setImportResult({ ok: false, message });
      toast.error(message);
    }
  };

  const handleEncryptedImport = async () => {
    if (!passphrase || passphrase.length === 0) {
      setPassphraseError(t("exportImport.passphrase.errors.required"));
      return;
    }
    setPassphraseError(null);
    const imported = await doImport(pendingEncryptedImportText, passphrase);
    if (!imported) return;
    setShowPassphraseDialog(null);
    setPendingEncryptedImportText(null);
    setPassphrase("");
  };

  const [importError, setImportError] = useState<string | null>(null);

  const doImport = async (text?: string | null, exportPassphrase?: string): Promise<boolean> => {
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
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["financialState"] }),
        queryClient.invalidateQueries({ queryKey: ["transactions"] }),
      ]);
      setCycleOverview(await getCycleOverview());
      {
        const message = t("exportImport.import.success");
        setImportResult({ ok: true, message });
        toast.success(message);
      }
      return true;
    } catch {
      const message = t("exportImport.import.errors.failed");
      setImportError(message);
      toast.error(message);
      return false;
    } finally {
      setImporting(false);
    }
  };

  return (
    <>
      <Card className="border-ocean-primary/25">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Archive className="h-5 w-5 text-ocean-primary" />
            {t("exportImport.cycle.title")}
          </CardTitle>
          <CardDescription>{t("exportImport.cycle.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {cycleError != null && !cycleDialogOpen && (
            <p role="alert" className="text-sm text-destructive">{cycleError}</p>
          )}
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-3">
            <div className="bg-card p-3">
              <p className="text-xs text-muted-foreground">{t("exportImport.cycle.currentEvents")}</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">{cycleOverview?.activityCount ?? "—"}</p>
            </div>
            <div className="bg-card p-3">
              <p className="text-xs text-muted-foreground">{t("exportImport.cycle.startedAt")}</p>
              <p className="mt-1 text-sm font-semibold">{formatCycleDate(cycleOverview?.startedAt ?? null, document.documentElement.lang || "en")}</p>
            </div>
            <div className="col-span-2 bg-card p-3 sm:col-span-1">
              <p className="text-xs text-muted-foreground">{t("exportImport.cycle.archivedCycles")}</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">{cycleHistory.length}</p>
            </div>
          </div>
          <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-xl text-xs leading-relaxed text-muted-foreground">{t("exportImport.cycle.keptSettings")}</p>
            <Button
              onClick={() => {
                setCycleError(null);
                setCycleDialogOpen(true);
              }}
              disabled={cycleOverview == null || cycleOverview.activityCount === 0}
              className="shrink-0"
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              {t("exportImport.cycle.action")}
            </Button>
          </div>

          {cycleHistory.length > 0 && (
            <div className="space-y-2 border-t border-border pt-4">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <History className="h-4 w-4 text-muted-foreground" />
                {t("exportImport.cycle.historyTitle")}
              </div>
              <div className="divide-y divide-border rounded-md border border-border">
                {cycleHistory.slice(0, 3).map((cycle) => (
                  <div key={cycle.id} className="flex items-center justify-between gap-3 p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{cycle.label}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {formatCycleDate(cycle.archivedAt, document.documentElement.lang || "en")} · {t("exportImport.cycle.eventCount", { count: cycle.eventCount })}
                      </p>
                    </div>
                    <code className="shrink-0 text-[10px] text-muted-foreground" title={cycle.backupSha256}>
                      {cycle.backupSha256.slice(0, 10)}…
                    </code>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

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

      <Dialog
        open={cycleDialogOpen}
        onOpenChange={(open) => {
          if (!open && !preparingCycle && !resettingCycle) resetCycleDialog();
        }}
      >
        <DialogContent className="max-w-2xl" onOpenAutoFocus={(event) => event.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 pr-8">
              <Archive className="h-5 w-5 text-primary" />
              {t("exportImport.cycle.dialogTitle")}
            </DialogTitle>
            <DialogDescription>
              {t(preparedCycle == null ? "exportImport.cycle.prepareDescription" : "exportImport.cycle.confirmDescription")}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3" aria-label={t("exportImport.cycle.progressLabel")}>
            <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground">1</span>
              <span>{t("exportImport.cycle.prepareStage")}</span>
            </div>
            <span className="h-px w-8 bg-border" aria-hidden="true" />
            <div className={`flex items-center justify-end gap-2 text-xs font-semibold ${preparedCycle == null ? "text-muted-foreground" : "text-foreground"}`}>
              <span className={`flex h-6 w-6 items-center justify-center rounded-full ${preparedCycle == null ? "border border-border bg-muted" : "bg-primary text-primary-foreground"}`}>2</span>
              <span>{t("exportImport.cycle.confirmStage")}</span>
            </div>
          </div>

          {preparedCycle == null ? (
            <form onSubmit={(event) => { void handlePrepareCycle(event); }} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="cycle-label">{t("exportImport.cycle.label")}</Label>
                <Input
                  id="cycle-label"
                  value={cycleLabel}
                  onChange={(event) => setCycleLabel(event.target.value)}
                  maxLength={80}
                  placeholder={t("exportImport.cycle.labelPlaceholder")}
                  required
                />
              </div>
              <fieldset className="space-y-3 border-t border-border pt-4">
                <legend className="pr-3 text-sm font-semibold">{t("exportImport.cycle.protectionTitle")}</legend>
                <p className="text-xs leading-relaxed text-muted-foreground">{t("exportImport.cycle.passphraseHelp")}</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="cycle-passphrase">{t("exportImport.cycle.passphrase")}</Label>
                    <Input
                      id="cycle-passphrase"
                      type="password"
                      value={cyclePassphrase}
                      onChange={(event) => setCyclePassphrase(event.target.value)}
                      minLength={8}
                      autoComplete="new-password"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cycle-passphrase-confirmation">{t("exportImport.cycle.passphraseConfirmation")}</Label>
                    <Input
                      id="cycle-passphrase-confirmation"
                      type="password"
                      value={cyclePassphraseConfirmation}
                      onChange={(event) => setCyclePassphraseConfirmation(event.target.value)}
                      minLength={8}
                      autoComplete="new-password"
                      required
                    />
                  </div>
                </div>
              </fieldset>
              {cycleError != null && <p role="alert" className="text-sm text-destructive">{cycleError}</p>}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={resetCycleDialog} disabled={preparingCycle}>
                  {t("common.cancel")}
                </Button>
                <Button type="submit" disabled={preparingCycle}>
                  {preparingCycle ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Archive className="mr-2 h-4 w-4" />}
                  {preparingCycle ? t("exportImport.cycle.preparing") : t("exportImport.cycle.prepare")}
                </Button>
              </DialogFooter>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-md border border-positive/30 bg-positive-wash p-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-positive" />
                <div>
                  <p className="text-sm font-semibold text-positive">{t("exportImport.cycle.archiveReady")}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t("exportImport.cycle.archiveReadyHelp")}</p>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-md border border-border p-3">
                  <div className="flex items-start gap-3">
                    <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-ocean-primary" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">{t("exportImport.cycle.backupFile")}</p>
                      <p className="mt-1 break-all text-xs text-muted-foreground">{preparedCycle.backupFilename}</p>
                    </div>
                  </div>
                  <Button type="button" variant="outline" size="sm" className="mt-3 w-full" onClick={() => handleCycleDownload("backup")}>
                    {downloadedCycleFiles.backup ? <CheckCircle2 className="mr-2 h-4 w-4 text-positive" /> : <Download className="mr-2 h-4 w-4" />}
                    {t("exportImport.cycle.downloadBackup")}
                  </Button>
                </div>
                <div className="rounded-md border border-border p-3">
                  <div className="flex items-start gap-3">
                    <FileSpreadsheet className="mt-0.5 h-5 w-5 shrink-0 text-ocean-primary" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">{t("exportImport.cycle.reportFile")}</p>
                      <p className="mt-1 break-all text-xs text-muted-foreground">{preparedCycle.reportFilename}</p>
                    </div>
                  </div>
                  <Button type="button" variant="outline" size="sm" className="mt-3 w-full" onClick={() => handleCycleDownload("report")}>
                    {downloadedCycleFiles.report ? <CheckCircle2 className="mr-2 h-4 w-4 text-positive" /> : <Download className="mr-2 h-4 w-4" />}
                    {t("exportImport.cycle.downloadReport")}
                  </Button>
                </div>
              </div>
              <details className="group rounded-md border border-border bg-background">
                <summary className="cursor-pointer px-3 py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground">
                  {t("exportImport.cycle.checksum")}
                </summary>
                <code className="block break-all border-t border-border px-3 py-2.5 text-[11px] leading-relaxed text-muted-foreground">{preparedCycle.backupSha256}</code>
              </details>

              <div className="space-y-3 border-t border-border pt-4">
                <div className="flex items-start gap-2">
                  <input
                    id="cycle-files-saved"
                    type="checkbox"
                    checked={savedFilesConfirmed}
                    onChange={(event) => setSavedFilesConfirmed(event.target.checked)}
                    disabled={!downloadedCycleFiles.backup || !downloadedCycleFiles.report}
                    className="mt-0.5 h-4 w-4 rounded border-border accent-primary"
                  />
                  <Label htmlFor="cycle-files-saved" className="text-sm font-normal leading-relaxed">
                    {t("exportImport.cycle.savedFilesConfirmation")}
                  </Label>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cycle-reset-confirmation">{t("exportImport.cycle.resetConfirmation")}</Label>
                  <Input
                    id="cycle-reset-confirmation"
                    value={resetConfirmation}
                    onChange={(event) => setResetConfirmation(event.target.value)}
                    placeholder="RESET"
                    autoComplete="off"
                    disabled={!savedFilesConfirmed}
                  />
                </div>
                <div className="flex items-start gap-2 rounded-md border border-danger/35 bg-danger-wash p-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
                  <p className="text-xs leading-relaxed text-danger">{t("exportImport.cycle.resetWarning")}</p>
                </div>
                {cycleError != null && <p role="alert" className="text-sm text-destructive">{cycleError}</p>}
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={resetCycleDialog} disabled={resettingCycle}>
                  {t("exportImport.cycle.keepCurrentCycle")}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  className="bg-danger-strong text-white hover:bg-danger-strong/90"
                  onClick={() => { void handleCycleReset(); }}
                  disabled={!downloadedCycleFiles.backup || !downloadedCycleFiles.report || !savedFilesConfirmed || resetConfirmation !== "RESET" || resettingCycle}
                >
                  {resettingCycle ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}
                  {resettingCycle ? t("exportImport.cycle.resetting") : t("exportImport.cycle.reset")}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Passphrase dialog for encrypted export/import */}
      <Dialog
        open={showPassphraseDialog != null}
        onOpenChange={(open) => {
          if (!open) {
            setShowPassphraseDialog(null);
            setPassphrase("");
            setPassphraseError(null);
            setPendingEncryptedImportText(null);
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
                  setPendingEncryptedImportText(null);
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
