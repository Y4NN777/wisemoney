import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, ChevronRight, ExternalLink, GraduationCap, Send, ShieldCheck, Square, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { AI_CAPABILITY_QUERY_KEY } from "../../components/AssistantCard/index.tsx";
import Logo from "../../components/Logo.tsx";
import { Button } from "../../components/ui/button.tsx";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../components/ui/dialog.tsx";
import { grantLearnProviderConsent, hasLearnProviderConsent } from "../../consent/consentStore.ts";
import HelpMessageMarkdown from "../../help/HelpMessageMarkdown.tsx";
import { getAICapability } from "../../lib/capabilities.ts";
import {
  LITERACY_AREAS,
  LITERACY_SOURCES,
  getLiteracyUnits,
  literacyLocale,
  type LiteracyUnit,
} from "../../literacy/corpus.ts";
import { TutorUnavailableError, askTutor, type TutorAnswer } from "../../pillars/literacy/index.ts";

type TutorMessage = {
  id: number;
  role: "user" | "assistant";
  text: string;
  answer?: TutorAnswer;
};

const MAX_QUESTION_LENGTH = 2_000;
const SUGGESTED_UNIT_IDS = ["first-income", "betting", "compound-interest"];

function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online;
}

export default function Learn() {
  const { t, i18n } = useTranslation();
  const locale = literacyLocale(i18n.resolvedLanguage ?? i18n.language);
  const units = getLiteracyUnits(locale);
  const online = useOnline();
  const capability = useQuery({ queryKey: AI_CAPABILITY_QUERY_KEY, queryFn: getAICapability });

  const [messages, setMessages] = useState<TutorMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [consent, setConsent] = useState(() => hasLearnProviderConsent());
  const [openUnit, setOpenUnit] = useState<LiteracyUnit | null>(null);
  const messageId = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (messages.length > 0) endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages]);

  useEffect(() => () => controller.current?.abort(), []);

  const ask = (question: string, unitIds?: string[]) => {
    const text = question.trim();
    if (text.length === 0 || busy) return;
    const history = messages.filter((message) => message.text.length > 0).map(({ role, text: body }) => ({ role, text: body }));
    const userId = ++messageId.current;
    const answerId = ++messageId.current;
    setMessages((current) => [...current, { id: userId, role: "user", text }, { id: answerId, role: "assistant", text: "" }]);
    setInput("");
    setError(null);
    setBusy(true);
    const abort = new AbortController();
    controller.current = abort;
    const useTutor = online && consent;

    void askTutor({ question: text, locale, history, online: useTutor, signal: abort.signal, ...(unitIds == null ? {} : { unitIds }) }, {
      onText: (chunk) => setMessages((current) => current.map((message) => message.id === answerId ? { ...message, text: message.text + chunk } : message)),
    }).then((answer) => {
      setMessages((current) => current.map((message) => message.id === answerId ? { ...message, answer } : message));
    }).catch((caught: unknown) => {
      setMessages((current) => current.filter((message) => message.id !== answerId || message.text.length > 0));
      if (abort.signal.aborted) return;
      setError(caught instanceof TutorUnavailableError && caught.reason === "quota"
        ? t("helpPage.chat.quotaReached")
        : !consent
          ? t("learn.tutor.errors.needConsent")
          : !online
            ? t("learn.tutor.errors.offline")
            : t("learn.tutor.errors.unavailable"));
    }).finally(() => {
      if (controller.current === abort) controller.current = null;
      setBusy(false);
    });
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    ask(input);
  };

  const reset = () => {
    controller.current?.abort();
    setMessages([]);
    setError(null);
  };

  const pathLabel = (answer: TutorAnswer) => answer.path === "lesson"
    ? t("learn.tutor.path.lesson")
    : answer.webSearch ? t("learn.tutor.path.web") : t("learn.tutor.path.tutor");

  return (
    <main aria-label={t("learn.title")} className="app-page">
      <div className="page-head">
        <div>
          <h1 className="page-title">{t("learn.title")}</h1>
          <p className="text-xs text-muted-foreground">{t("learn.disclosure")}</p>
        </div>
        {messages.length > 0 && (
          <Button type="button" variant="outline" size="sm" onClick={reset}>
            <Trash2 className="mr-1 h-4 w-4" />{t("learn.tutor.clear")}
          </Button>
        )}
      </div>

      <section aria-label={t("learn.tutor.title")} className="rounded-lg border border-border bg-card">
        <div className="space-y-3 p-3" aria-live="polite">
          {messages.length === 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ocean-wash" aria-hidden="true">
                  <Logo variant="icon" className="h-6 w-6" />
                </span>
                <h2 className="text-sm font-semibold">{t("learn.tutor.title")}</h2>
              </div>
              <ul className="flex flex-wrap gap-2" aria-label={t("learn.tutor.suggestions")}>
                {SUGGESTED_UNIT_IDS.flatMap((id) => units.find((unit) => unit.id === id) ?? []).map((unit) => (
                  <li key={unit.id}>
                    <button type="button" onClick={() => ask(unit.title, [unit.id])} disabled={busy} className="rounded-full border border-ocean-primary/40 bg-card px-3 py-1.5 text-left text-sm text-ocean-primary hover:bg-ocean-wash disabled:opacity-50">
                      {unit.title}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {messages.map((message) => (
            <article key={message.id} className={message.role === "user" ? "flex justify-end" : "flex items-end gap-2"}>
              {message.role === "assistant" && (
                <span className="mb-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ocean-wash" aria-hidden="true">
                  <Logo variant="icon" className="h-5 w-5" />
                </span>
              )}
              <div className={message.role === "user"
                ? "max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3.5 py-2.5 text-sm text-primary-foreground"
                : "min-w-0 max-w-[88%] rounded-2xl rounded-bl-sm bg-muted px-3.5 py-2.5 text-sm"}>
                {message.role === "assistant" && message.text.length > 0
                  ? <HelpMessageMarkdown text={message.text} />
                  : <p className="whitespace-pre-wrap leading-relaxed">{message.text || t("learn.tutor.writing")}</p>}
                {message.answer != null && (
                  <div className="mt-2 space-y-2 border-t border-foreground/10 pt-2">
                    <p className="text-[11px] text-muted-foreground">{pathLabel(message.answer)}</p>
                    {message.answer.unitIds.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {message.answer.unitIds.flatMap((id) => units.find((unit) => unit.id === id) ?? []).map((unit) => (
                          <button key={unit.id} type="button" onClick={() => setOpenUnit(unit)} className="inline-flex items-center gap-1 rounded-full bg-card px-2.5 py-1 text-left text-xs font-semibold text-ocean-primary hover:bg-ocean-wash" aria-label={t("learn.lesson.open", { title: unit.title })}>
                            <BookOpen className="h-3.5 w-3.5 shrink-0" />{unit.title}
                          </button>
                        ))}
                      </div>
                    )}
                    {message.answer.sources.length > 0 && (
                      <ul className="space-y-1" aria-label={t("learn.tutor.sources")}>
                        {message.answer.sources.map((source) => (
                          <li key={source.uri}>
                            <a href={source.uri} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-ocean-primary underline underline-offset-2">
                              <ExternalLink className="h-3 w-3 shrink-0" />{source.title}
                            </a>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            </article>
          ))}
          {error != null && <p className="rounded-lg border-l-2 border-destructive bg-muted p-3 text-xs" role="alert">{error}</p>}
          <div ref={endRef} />
        </div>

        <footer className="border-t border-border p-3">
          {!consent && (
            <div className="mb-2 flex items-center gap-2 rounded-lg bg-ocean-wash px-3 py-2 text-xs" role="note">
              <ShieldCheck className="h-4 w-4 shrink-0 text-ocean-primary" />
              <span className="min-w-0 flex-1 leading-snug">{t("learn.tutor.consent")}</span>
              <Button type="button" size="sm" className="h-8" onClick={() => { grantLearnProviderConsent(); setConsent(true); }}>{t("learn.tutor.ok")}</Button>
            </div>
          )}
          <form onSubmit={handleSubmit} className="grid grid-cols-[1fr_2.5rem] items-end gap-2">
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              maxLength={MAX_QUESTION_LENGTH}
              rows={1}
              disabled={busy}
              placeholder={t("learn.tutor.placeholder")}
              aria-label={t("learn.tutor.placeholder")}
              className="min-h-10 resize-none rounded-2xl border border-input bg-background px-4 py-2.5 text-base text-foreground focus-visible:border-primary sm:text-sm"
            />
            {busy
              ? <Button type="button" size="icon" variant="outline" className="rounded-full" onClick={() => controller.current?.abort()} aria-label={t("learn.tutor.stop")}><Square className="h-4 w-4" /></Button>
              : <Button type="submit" size="icon" className="rounded-full" disabled={input.trim().length === 0} aria-label={t("learn.tutor.send")}><Send className="h-4 w-4" /></Button>}
          </form>
          {capability.data?.available === true && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              {t("learn.tutor.personal")} <Link to="/assistant" className="font-semibold text-ocean-primary underline underline-offset-2">{t("assistant.title")}</Link>
            </p>
          )}
        </footer>
      </section>

      <section aria-label={t("learn.lessons.title")} className="space-y-2">
        <h2 className="flex items-center gap-2 px-1 text-sm font-semibold"><GraduationCap className="h-4 w-4 text-ocean-primary" />{t("learn.lessons.title")}</h2>
        {LITERACY_AREAS.map((area, index) => {
          const areaUnits = units.filter((unit) => unit.area === area);
          return (
            <details key={area} className="group rounded-lg border border-border bg-card" open={index === 0}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-3 py-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <span>{t(`learn.areas.${area}`)}</span>
                <span className="flex items-center gap-2 text-xs font-normal text-muted-foreground">
                  {t("learn.lessons.count", { count: areaUnits.length })}
                  <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" />
                </span>
              </summary>
              <ul className="divide-y divide-border border-t border-border">
                {areaUnits.map((unit) => (
                  <li key={unit.id}>
                    <button type="button" onClick={() => setOpenUnit(unit)} className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left text-sm hover:bg-muted">
                      <span className="min-w-0">{unit.title}</span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          );
        })}
        <p className="px-1 text-[11px] leading-relaxed text-muted-foreground">{t("learn.draft")}</p>
      </section>

      <Dialog open={openUnit != null} onOpenChange={(open) => { if (!open) setOpenUnit(null); }}>
        {openUnit != null && (
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="pr-6 text-base">{openUnit.title}</DialogTitle>
              <DialogDescription className="text-sm text-foreground/80">{openUnit.summary}</DialogDescription>
            </DialogHeader>
            <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed">
              {openUnit.points.map((point) => <li key={point}>{point}</li>)}
            </ul>
            <div className="rounded-lg bg-ocean-wash p-3 text-sm leading-relaxed">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ocean-primary">{t("learn.lesson.example")}</p>
              {openUnit.example}
            </div>
            <div className="rounded-lg border border-border p-3 text-sm leading-relaxed">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("learn.lesson.watchOut")}</p>
              {openUnit.watchOut}
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {t("learn.lesson.basis")} {openUnit.sources.map((source) => LITERACY_SOURCES[source]).join(" · ")}
            </p>
            <Button type="button" onClick={() => { const unit = openUnit; setOpenUnit(null); ask(unit.title, [unit.id]); }} disabled={busy}>
              {t("learn.lesson.ask")}
            </Button>
          </DialogContent>
        )}
      </Dialog>
    </main>
  );
}
