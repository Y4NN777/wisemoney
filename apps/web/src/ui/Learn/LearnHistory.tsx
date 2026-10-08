import { History, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/ui/button.tsx";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "../../components/ui/sheet.tsx";
import { useMasterKey } from "../../lib/masterKeyContext.ts";
import {
  deleteAllLearnConversations,
  deleteLearnConversation,
  listLearnConversations,
  type LearnConversationSummary,
} from "../../literacy/conversationStore.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Today's conversations show the time, older ones the date. */
function whenLabel(timestamp: number, locale: string, now = Date.now()): string {
  const sameDay = now - timestamp < DAY_MS && new Date(now).getDate() === new Date(timestamp).getDate();
  return new Intl.DateTimeFormat(locale, sameDay ? { hour: "2-digit", minute: "2-digit" } : { day: "numeric", month: "short" }).format(timestamp);
}

/** WiseLearn's past conversations, kept encrypted on the device until the learner deletes them. */
export default function LearnHistory({ currentId, onOpen, onCurrentDeleted }: { currentId: string | null; onOpen: (id: string) => void; onCurrentDeleted: () => void }) {
  const { t, i18n } = useTranslation();
  const masterKey = useMasterKey();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<LearnConversationSummary[] | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);

  const refresh = async () => setItems(await listLearnConversations(masterKey).catch(() => []));

  const changeOpen = (next: boolean) => {
    setOpen(next);
    setConfirmAll(false);
    if (next) void refresh();
  };

  const remove = async (id: string) => {
    await deleteLearnConversation(id);
    if (id === currentId) onCurrentDeleted();
    await refresh();
  };

  const removeAll = async () => {
    await deleteAllLearnConversations();
    if (currentId != null) onCurrentDeleted();
    setConfirmAll(false);
    await refresh();
  };

  return (
    <Sheet open={open} onOpenChange={changeOpen}>
      <SheetTrigger asChild>
        <Button type="button" variant="ghost" size="icon" className="h-11 w-11 shrink-0 text-muted-foreground" aria-label={t("learn.history.open")} title={t("learn.history.open")}>
          <History className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="flex w-[85vw] max-w-sm flex-col p-0">
        <SheetHeader className="border-b border-border px-5 py-4 pr-12 text-left">
          <SheetTitle>{t("learn.history.title")}</SheetTitle>
          <SheetDescription>{t("learn.history.private")}</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {items != null && items.length === 0 && (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">{t("learn.history.empty")}</p>
          )}
          {items != null && items.length > 0 && (
            <ul className="space-y-0.5" aria-label={t("learn.history.title")}>
              {items.map((item) => (
                <li key={item.id} className={`flex items-center gap-1 rounded-xl ${item.id === currentId ? "bg-muted" : ""}`}>
                  <button type="button" onClick={() => { onOpen(item.id); setOpen(false); }} aria-current={item.id === currentId ? "true" : undefined} className="min-h-11 min-w-0 flex-1 rounded-xl px-3 py-2 text-left hover:bg-muted">
                    <span className="block truncate text-sm text-foreground">{item.title}</span>
                    <span className="block text-xs text-muted-foreground">{whenLabel(item.updatedAt, i18n.resolvedLanguage ?? i18n.language)}</span>
                  </button>
                  <Button type="button" variant="ghost" size="icon" className="h-11 w-11 shrink-0 text-muted-foreground" onClick={() => void remove(item.id)} aria-label={t("learn.history.delete", { title: item.title })}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {items != null && items.length > 0 && (
          <div className="border-t border-border p-3 pb-[calc(0.75rem+var(--safe-area-bottom))]">
            {confirmAll ? (
              <div className="flex items-center gap-2" role="group" aria-label={t("learn.history.confirmAll")}>
                <p className="min-w-0 flex-1 text-sm">{t("learn.history.confirmAll")}</p>
                <Button type="button" variant="ghost" size="sm" className="h-11" onClick={() => setConfirmAll(false)}>{t("common.cancel")}</Button>
                <Button type="button" variant="destructive" size="sm" className="h-11" onClick={() => void removeAll()}>{t("learn.history.confirm")}</Button>
              </div>
            ) : (
              <Button type="button" variant="ghost" className="h-11 w-full justify-start gap-2 text-destructive" onClick={() => setConfirmAll(true)}>
                <Trash2 className="h-4 w-4" />{t("learn.history.deleteAll")}
              </Button>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
