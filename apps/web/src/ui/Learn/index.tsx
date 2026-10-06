import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Send, ShieldCheck, Square, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { AI_CAPABILITY_QUERY_KEY } from "../../components/AssistantCard/index.tsx";
import { Button } from "../../components/ui/button.tsx";
import { grantLearnProviderConsent, hasLearnProviderConsent } from "../../consent/consentStore.ts";
import HelpMessageMarkdown from "../../help/HelpMessageMarkdown.tsx";
import { getAICapability } from "../../lib/capabilities.ts";
import { LITERACY_STARTERS } from "../../literacy/starters.ts";
import { TutorUnavailableError, askTutor, type TutorAnswer } from "../../pillars/literacy/index.ts";

type TutorMessage = {
  id: number;
  role: "user" | "assistant";
  text: string;
  answer?: TutorAnswer;
};

const MAX_QUESTION_LENGTH = 2_000;

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
  const locale = (i18n.resolvedLanguage ?? i18n.language).toLowerCase().startsWith("fr") ? "fr" : "en";
  const online = useOnline();
  const capability = useQuery({ queryKey: AI_CAPABILITY_QUERY_KEY, queryFn: getAICapability });

  const [messages, setMessages] = useState<TutorMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [consent, setConsent] = useState(() => hasLearnProviderConsent());
  const messageId = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (messages.length > 0) endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages]);

  useEffect(() => () => controller.current?.abort(), []);

  const ask = (question: string) => {
    const text = question.trim();
    if (text.length === 0 || busy) return;
    // The tutor needs its notice accepted and a connection; say so instead of sending anything.
    if (!consent) {
      setError(t("learn.tutor.errors.needConsent"));
      return;
    }
    if (!online) {
      setError(t("learn.tutor.errors.offline"));
      return;
    }
    const history = messages.filter((message) => message.text.length > 0).map(({ role, text: body }) => ({ role, text: body }));
    const userId = ++messageId.current;
    const answerId = ++messageId.current;
    setMessages((current) => [...current, { id: userId, role: "user", text }, { id: answerId, role: "assistant", text: "" }]);
    setInput("");
    setError(null);
    setBusy(true);
    const abort = new AbortController();
    controller.current = abort;
    void askTutor({ question: text, locale, history, online, signal: abort.signal }, {
      onText: (chunk) => setMessages((current) => current.map((message) => message.id === answerId ? { ...message, text: message.text + chunk } : message)),
    }).then((answer) => {
      setMessages((current) => current.map((message) => message.id === answerId ? { ...message, answer } : message));
    }).catch((caught: unknown) => {
      setMessages((current) => current.filter((message) => message.id !== answerId || message.text.length > 0));
      if (abort.signal.aborted) return;
      setError(caught instanceof TutorUnavailableError && caught.reason === "quota"
        ? t("helpPage.chat.quotaReached")
        : caught instanceof TutorUnavailableError && caught.reason === "offline"
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

  return (
    <main aria-label={t("learn.title")} className="app-page">
      <div className="page-head">
        <div>
          <h1 className="page-title">{t("learn.title")}</h1>
          <p className="mt-1 text-xs text-muted-foreground">{t("learn.disclosure")}</p>
        </div>
        {messages.length > 0 && (
          <Button type="button" variant="outline" size="sm" onClick={reset}>
            <Trash2 className="mr-1 h-4 w-4" />{t("learn.tutor.clear")}
          </Button>
        )}
      </div>

      <section aria-label={t("learn.title")} className="rounded-lg border border-border bg-card">
        <div className="space-y-3 p-3" aria-live="polite">
          {messages.length === 0 && (
            <div className="space-y-2">
              <ul className="flex flex-wrap gap-2" aria-label={t("learn.tutor.suggestions")}>
                {LITERACY_STARTERS.map((starter) => (
                  <li key={starter.id}>
                    <button type="button" onClick={() => ask(starter.question[locale])} disabled={busy} className="min-h-11 rounded-2xl border border-ocean-primary/40 bg-card px-3 py-1.5 text-left text-sm text-ocean-primary hover:bg-ocean-wash disabled:opacity-50">
                      {starter.question[locale]}
                    </button>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">{t("learn.tutor.startersNote")}</p>
            </div>
          )}
          {messages.map((message) => (
            <article key={message.id} className={message.role === "user" ? "flex justify-end" : "flex"}>
              <div className={message.role === "user"
                ? "max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3.5 py-2.5 text-sm text-primary-foreground"
                : "min-w-0 max-w-[92%] rounded-2xl rounded-bl-sm bg-muted px-3.5 py-2.5 text-sm"}>
                {message.role === "assistant" && message.text.length > 0
                  ? <HelpMessageMarkdown text={message.text} />
                  : <p className="whitespace-pre-wrap leading-relaxed">{message.text || t("learn.tutor.writing")}</p>}
                {message.answer != null && <AnswerSource answer={message.answer} />}
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
              <Button type="button" size="sm" className="h-11 min-w-11" onClick={() => { grantLearnProviderConsent(); setConsent(true); }}>{t("learn.tutor.ok")}</Button>
            </div>
          )}
          <form onSubmit={handleSubmit} className="grid grid-cols-[1fr_2.75rem] items-end gap-2">
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              maxLength={MAX_QUESTION_LENGTH}
              rows={1}
              disabled={busy}
              placeholder={t("learn.tutor.placeholder")}
              aria-label={t("learn.tutor.placeholder")}
              className="min-h-11 resize-none rounded-2xl border border-input bg-background px-4 py-2.5 text-base text-foreground focus-visible:border-primary sm:text-sm"
            />
            {busy
              ? <Button type="button" size="icon" variant="outline" className="rounded-full" onClick={() => controller.current?.abort()} aria-label={t("learn.tutor.stop")}><Square className="h-4 w-4" /></Button>
              : <Button type="submit" size="icon" className="rounded-full" disabled={input.trim().length === 0} aria-label={t("learn.tutor.send")}><Send className="h-4 w-4" /></Button>}
          </form>
          {capability.data?.available === true && (
            <p className="mt-2 text-xs text-muted-foreground">
              {t("learn.tutor.personal")} <Link to="/assistant" className="font-semibold text-ocean-primary underline underline-offset-2">{t("assistant.title")}</Link>
            </p>
          )}
        </footer>
      </section>

    </main>
  );
}

/**
 * Under an answer: the closest lesson and who it is drawn from, one line; and, when the tutor
 * searched the web, its sources with the caution that web figures can be wrong.
 */
function AnswerSource({ answer }: { answer: TutorAnswer }) {
  const { t } = useTranslation();
  const lesson = answer.lessons[0];
  if (lesson == null && answer.sources.length === 0) return null;
  return (
    <div className="mt-2 space-y-1 border-t border-foreground/10 pt-2 text-xs text-muted-foreground">
      {lesson != null && (
        <p>{t("learn.tutor.source", { title: lesson.title, publisher: lesson.publishers.slice(0, 2).join(", ") || "WiseMoney" })}</p>
      )}
      {answer.sources.length > 0 && (
        <>
          <p className="leading-snug">{t("learn.tutor.webCaution")}</p>
          <ul className="space-y-1" aria-label={t("learn.tutor.sources")}>
            {answer.sources.map((source) => (
              <li key={source.uri}>
                <a href={source.uri} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-ocean-primary underline underline-offset-2">
                  <ExternalLink className="h-3 w-3 shrink-0" />{source.title}
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
