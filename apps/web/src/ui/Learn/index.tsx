import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowUp, BookOpen, ExternalLink, RotateCcw, ShieldCheck, Square } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { AI_CAPABILITY_QUERY_KEY } from "../../components/AssistantCard/index.tsx";
import { Button } from "../../components/ui/button.tsx";
import { TypingDots } from "../../components/ui/typing-dots.tsx";
import { grantLearnProviderConsent, hasLearnProviderConsent } from "../../consent/consentStore.ts";
import HelpMessageMarkdown from "../../help/HelpMessageMarkdown.tsx";
import { getAICapability } from "../../lib/capabilities.ts";
import { splitAnswer } from "../../literacy/answerText.ts";
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
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

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
    // The suggested follow-ups are buttons, not part of what the tutor said: they stay out of the history.
    const history = messages.filter((message) => message.text.length > 0).map(({ role, text: body }) => ({ role, text: role === "assistant" ? splitAnswer(body).body : body }));
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

  const lastAnswerId = [...messages].reverse().find((message) => message.role === "assistant")?.id ?? null;

  const startWithTopic = (topic: string) => {
    setInput(`${topic} : `);
    composerRef.current?.focus();
  };

  const empty = messages.length === 0;

  // Laid out like current chat apps (Y4NN, 2026-10-08: "like ChatGPT"): a centred start screen, the
  // learner's questions in grey bubbles, answers as plain text across the page, one rounded composer
  // pinned above the tab bar with the send button inside it.
  return (
    <main aria-label={t("learn.title")} className="mx-auto flex min-h-[calc(100dvh-9.5rem)] w-full max-w-2xl flex-col">
      {empty ? (
        <section aria-label={t("learn.title")} className="flex flex-1 flex-col items-center justify-center gap-6 py-6 text-center">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">{t("learn.title")}</h1>
            <p className="text-xs text-muted-foreground">{t("learn.disclosure")}</p>
          </div>
          <ul className="flex flex-wrap justify-center gap-2" aria-label={t("learn.topics.label")}>
            {TOPICS.map((topic) => (
              <li key={topic}>
                <button type="button" onClick={() => startWithTopic(t(`learn.topics.${topic}`))} className="inline-flex h-11 items-center rounded-full border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted">
                  {t(`learn.topics.${topic}`)}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3 pb-2">
            <h1 className="text-base font-semibold">{t("learn.title")}</h1>
            <Button type="button" variant="ghost" size="icon" className="shrink-0 text-muted-foreground" onClick={reset} aria-label={t("learn.tutor.clear")} title={t("learn.tutor.clear")}>
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>
          <section aria-label={t("learn.title")} className="flex-1 space-y-6 pb-4" aria-live="polite">
            {messages.map((message) => message.role === "user" ? (
              <article key={message.id} className="flex justify-end">
                <p className="max-w-[85%] whitespace-pre-wrap rounded-3xl bg-muted px-4 py-2.5 text-[0.9375rem] leading-relaxed text-foreground">{message.text}</p>
              </article>
            ) : (
              <article key={message.id} className="space-y-3">
                {message.text.length === 0
                  ? <TypingDots label={t("learn.tutor.writing")} />
                  : <AnswerBody text={message.text} />}
                {message.answer != null && <AnswerSource answer={message.answer} />}
                {message.answer != null && message.id === lastAnswerId && (
                  <FollowUps questions={splitAnswer(message.text).followUps} disabled={busy} onAsk={ask} label={t("learn.tutor.followUps")} />
                )}
              </article>
            ))}
            <div ref={endRef} />
          </section>
        </>
      )}

      <div className="sticky bottom-[calc(4.75rem+var(--safe-area-bottom))] z-10 space-y-2 bg-gradient-to-t from-background from-70% to-transparent pt-3 lg:bottom-4">
        {error != null && <p className="rounded-xl bg-muted px-3 py-2 text-sm" role="alert">{error}</p>}
        {empty && (
          <div className="space-y-1.5">
            <ul className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]" aria-label={t("learn.tutor.suggestions")}>
              {LITERACY_STARTERS.map((starter) => (
                <li key={starter.id} className="shrink-0 snap-start">
                  <button type="button" onClick={() => ask(starter.question[locale])} disabled={busy} className="h-full w-60 rounded-2xl border border-border bg-card px-4 py-3 text-left text-sm leading-snug text-foreground transition-colors hover:bg-muted disabled:opacity-50">
                    {starter.question[locale]}
                  </button>
                </li>
              ))}
            </ul>
            <p className="px-1 text-[0.75rem] text-muted-foreground">{t("learn.tutor.startersNote")}</p>
          </div>
        )}
        {!consent && (
          <div className="flex items-center gap-2 rounded-2xl bg-ocean-wash px-3 py-1.5 text-xs" role="note">
            <ShieldCheck className="h-4 w-4 shrink-0 text-ocean-primary" />
            <span className="min-w-0 flex-1 leading-snug">{t("learn.tutor.consent")}</span>
            <Button type="button" size="sm" className="min-w-11 rounded-full" onClick={() => { grantLearnProviderConsent(); setConsent(true); setError(null); }}>{t("learn.tutor.ok")}</Button>
          </div>
        )}
        <form onSubmit={handleSubmit} className="flex items-end gap-2 rounded-[1.75rem] border border-border bg-card p-1.5 pl-4 shadow-[0_4px_20px_rgba(16,24,32,0.08)] focus-within:border-ocean-primary/50">
          <textarea
            ref={composerRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                ask(input);
              }
            }}
            maxLength={MAX_QUESTION_LENGTH}
            rows={1}
            disabled={busy}
            placeholder={t("learn.tutor.placeholder")}
            aria-label={t("learn.tutor.placeholder")}
            className="max-h-32 min-h-11 flex-1 resize-none bg-transparent py-2.5 text-base text-foreground placeholder:text-muted-foreground focus-visible:outline-none"
          />
          {busy
            ? <Button type="button" size="icon" className="shrink-0 rounded-full bg-foreground text-background hover:bg-foreground/85" onClick={() => controller.current?.abort()} aria-label={t("learn.tutor.stop")}><Square className="h-3.5 w-3.5 fill-current" /></Button>
            : <Button type="submit" size="icon" className="shrink-0 rounded-full bg-foreground text-background hover:bg-foreground/85 disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100" disabled={input.trim().length === 0} aria-label={t("learn.tutor.send")}><ArrowUp className="h-5 w-5" /></Button>}
        </form>
        {capability.data?.available === true && (
          <p className="px-3 text-center text-xs text-muted-foreground">
            {t("learn.tutor.personal")} <Link to="/assistant" className="font-semibold text-ocean-primary underline underline-offset-2">{t("assistant.title")}</Link>
          </p>
        )}
      </div>
    </main>
  );
}

/** Plain topic words that open the composer with the topic typed in, for people who do not know what to ask. */
const TOPICS = ["budget", "saving", "bank", "credit", "scams", "investing"] as const;

/** The answer as text on the page (no bubble), without the follow-up lines. */
function AnswerBody({ text }: { text: string }) {
  return (
    <div className="text-[0.9375rem] leading-relaxed text-foreground">
      <HelpMessageMarkdown text={splitAnswer(text).body} />
    </div>
  );
}

/** Two questions the learner could ask next, as buttons under the latest answer. */
function FollowUps({ questions, disabled, onAsk, label }: { questions: string[]; disabled: boolean; onAsk: (question: string) => void; label: string }) {
  if (questions.length === 0) return null;
  return (
    <ul className="flex flex-col items-start gap-2" aria-label={label}>
      {questions.map((question) => (
        <li key={question}>
          <button type="button" disabled={disabled} onClick={() => onAsk(question)} className="min-h-11 rounded-2xl border border-border bg-card px-4 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted disabled:opacity-50">
            {question}
          </button>
        </li>
      ))}
    </ul>
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
    <div className="space-y-2 text-xs text-muted-foreground">
      {lesson != null && (
        <p className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-muted px-3 py-1.5">
          <BookOpen className="h-3.5 w-3.5 shrink-0 text-ocean-primary" aria-hidden="true" />
          <span className="truncate">{t("learn.tutor.source", { title: lesson.title, publisher: lesson.publishers.slice(0, 2).join(", ") || "WiseMoney" })}</span>
        </p>
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
