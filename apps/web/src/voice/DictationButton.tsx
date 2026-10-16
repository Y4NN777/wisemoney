import { Mic, Square } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../components/ui/button.tsx";
import type { Dictation } from "./useDictation.ts";

/** Sits where the send button is while the box is empty, so the box keeps its width. */
export default function DictationButton({ dictation, disabled = false }: { dictation: Dictation; disabled?: boolean }) {
  const { t } = useTranslation();
  return dictation.listening ? (
    <Button type="button" size="icon" className="shrink-0 rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={dictation.stop} aria-label={t("voice.stop")}>
      <Square className="h-3.5 w-3.5 fill-current" />
    </Button>
  ) : (
    <Button type="button" size="icon" variant="ghost" className="shrink-0 rounded-full text-foreground" disabled={disabled} onClick={dictation.start} aria-label={t("voice.start")} title={t("voice.start")}>
      <Mic className="h-5 w-5" />
    </Button>
  );
}

/** Says while listening whether the voice stays on the phone. */
export function DictationNote({ dictation }: { dictation: Dictation }) {
  const { t } = useTranslation();
  if (!dictation.listening) return null;
  return (
    <p className="px-3 text-xs text-muted-foreground" role="status">
      {t("voice.listening")} {dictation.onDevice ? t("voice.onDevice") : t("voice.service")}
    </p>
  );
}
