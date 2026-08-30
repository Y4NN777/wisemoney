import { ArrowLeft, Bot, ImagePlus, LoaderCircle, Send, ShieldCheck, Trash2, WifiOff, X } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent, type ClipboardEvent, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import Logo from "../components/Logo.tsx";
import { Button } from "../components/ui/button.tsx";
import { findRelevantHelpSections, localTaskAnswer, type HelpSection } from "./corpus.ts";
import type { SafeHelpContext } from "./context.ts";
import {
  streamHelpMessage,
  type HelpChatHistoryMessage,
  type HelpTicket,
} from "./chatClient.ts";
import { firstImageFromClipboard, sanitizeHelpImage } from "./image.ts";
import { grantHelpProviderConsent, hasHelpProviderConsent } from "../consent/consentStore.ts";
import HelpMessageMarkdown from "./HelpMessageMarkdown.tsx";
import {
  LocalAdmissionError,
  beginLocalTicket,
  cancelLocalTicket,
  finishLocalTicket,
  getLocalTicket,
  requestLocalTicket,
  waitForLocalAdmissionChange,
} from "./localAdmission.ts";

type DisplayMessage = HelpChatHistoryMessage & {
  id: number;
  sectionIds?: string[];
  imageAttached?: boolean;
};

type PendingRequest = {
  cancelled: boolean;
  ticketId?: string;
  controller?: AbortController;
};

const POLL_INTERVAL_MS = 1_250;

export default function HelpChat({
  sections,
  openRequest,
  initialPrompt,
  safeContext,
  onOpenChange,
  vaultUnlocked,
}: {
  sections: HelpSection[];
  openRequest: number;
  initialPrompt?: string;
  safeContext: SafeHelpContext;
  onOpenChange?: (open: boolean) => void;
  vaultUnlocked: boolean;
}) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [input, setInput] = useState("");
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [imageBusy, setImageBusy] = useState(false);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [ticket, setTicket] = useState<HelpTicket | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [consentAccepted, setConsentAccepted] = useState(() => hasHelpProviderConsent());
  const [showConsent, setShowConsent] = useState(() => !hasHelpProviderConsent());
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const pendingRef = useRef<PendingRequest | null>(null);
  const messageIdRef = useRef(0);
  const previousVaultUnlockedRef = useRef(vaultUnlocked);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, ticket]);

  const applyImage = async (file: File | null) => {
    if (file == null) return;
    setImageBusy(true);
    setError(null);
    try {
      setImageDataUrl(await sanitizeHelpImage(file));
    } catch {
      setError(t("helpPage.chat.imageError"));
    } finally {
      setImageBusy(false);
    }
  };

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    void applyImage(event.target.files?.[0] ?? null);
    event.target.value = "";
  };

  const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const file = firstImageFromClipboard(event.clipboardData.items);
    if (file != null) void applyImage(file);
  };

  const cancelPending = () => {
    const pending = pendingRef.current;
    if (pending == null) return;
    pending.cancelled = true;
    pending.controller?.abort();
    pendingRef.current = null;
    if (pending.ticketId != null) {
      void cancelLocalTicket(pending.ticketId).catch(() => undefined);
    }
    setTicket(null);
    setSubmitting(false);
  };

  const closePanel = () => {
    setOpen(false);
    onOpenChange?.(false);
  };

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusPanel = window.requestAnimationFrame(() => {
      panelRef.current?.querySelector<HTMLElement>("button, textarea, input, a[href]")?.focus();
    });
    const keepFocusInside = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closePanel();
        return;
      }
      if (event.key !== "Tab" || panelRef.current == null) return;
      const focusable = [...panelRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), textarea:not([disabled]), input:not([disabled]), a[href]")];
      const first = focusable[0];
      const last = focusable.at(-1);
      if (first == null || last == null) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", keepFocusInside);
    return () => {
      window.cancelAnimationFrame(focusPanel);
      document.removeEventListener("keydown", keepFocusInside);
      previousFocusRef.current?.focus();
    };
  }, [open]);

  const resetConversation = () => {
    cancelPending();
    setMessages([]);
    setTicket(null);
    setInput("");
    setImageDataUrl(null);
    setError(null);
  };

  useEffect(() => {
    if (openRequest <= 0) return;
    setOpen(true);
    onOpenChange?.(true);
    if (initialPrompt != null && initialPrompt.trim().length > 0 && messages.length === 0) {
      setInput(initialPrompt.trim());
    }
  }, [initialPrompt, openRequest]);

  useEffect(() => {
    if (previousVaultUnlockedRef.current && !vaultUnlocked) resetConversation();
    previousVaultUnlockedRef.current = vaultUnlocked;
  }, [vaultUnlocked]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const question = input.trim();
    if (question.length === 0 || !online || submitting || imageBusy) return;
    if (!consentAccepted) {
      setShowConsent(true);
      return;
    }

    const previousSectionIds = messages.flatMap((message) => message.role === "assistant" && message.sectionIds?.[0] != null ? [message.sectionIds[0]] : []).slice(-3);
    const selectedSections = findRelevantHelpSections(sections, question, 4, previousSectionIds, safeContext.surfaceId);
    const priorHistory = messages.map(({ role, text }) => ({ role, text }));
    const image = imageDataUrl;
    const userMessage: DisplayMessage = {
      id: ++messageIdRef.current,
      role: "user",
      text: question,
      ...(image == null ? {} : { imageAttached: true }),
    };
    setMessages((current) => [...current, userMessage]);
    setInput("");
    setImageDataUrl(null);
    setSubmitting(true);
    setError(null);

    const pending: PendingRequest = { cancelled: false };
    pendingRef.current = pending;

    void (async () => {
      let assistantId: number | null = null;
      try {
        let currentTicket = await requestLocalTicket(image != null);
        pending.ticketId = currentTicket.id;
        setTicket(currentTicket);

        while (currentTicket.status === "waiting" && !pending.cancelled) {
          await waitForLocalAdmissionChange(POLL_INTERVAL_MS);
          if (pending.cancelled) return;
          currentTicket = await getLocalTicket(currentTicket.id);
          setTicket(currentTicket);
        }
        if (pending.cancelled) return;
        if (currentTicket.status !== "admitted") throw new Error("ticket-expired");
        currentTicket = await beginLocalTicket(currentTicket.id);
        setTicket(currentTicket);
        pending.controller = new AbortController();

        const nextAssistantId = ++messageIdRef.current;
        assistantId = nextAssistantId;
        setMessages((current) => [...current, {
          id: nextAssistantId,
          role: "assistant",
          text: "",
          sectionIds: selectedSections.map(({ id }) => id),
        }]);

        await streamHelpMessage({
          question,
          ...(image == null ? {} : { imageDataUrl: image }),
          locale: (i18n.resolvedLanguage ?? i18n.language).startsWith("fr") ? "fr" : "en",
          history: priorHistory,
          sections: selectedSections,
          safeContext: {
            ...safeContext,
            ...(selectedSections[0] == null ? {} : { taskId: selectedSections[0].id }),
          },
          signal: pending.controller.signal,
        }, (chunk) => {
          setMessages((current) => current.map((message) =>
            message.id === nextAssistantId ? { ...message, text: message.text + chunk } : message));
        }, (meta) => {
          setMessages((current) => current.map((message) =>
            message.id === nextAssistantId ? { ...message, sectionIds: meta.taskIds } : message));
        });
        setTicket(await finishLocalTicket(currentTicket.id, true));
      } catch (caught) {
        if (!pending.cancelled && pending.ticketId != null) {
          await finishLocalTicket(pending.ticketId, false).then(setTicket).catch(() => undefined);
        }
        if (!pending.cancelled) {
          const fallback = selectedSections[0];
          if (assistantId != null && fallback != null && !(caught instanceof LocalAdmissionError && caught.reason === "quota")) {
            setMessages((current) => current.map((message) => message.id === assistantId
              ? { ...message, text: localTaskAnswer(fallback), sectionIds: [fallback.id] }
              : message));
          } else {
            setError(caught instanceof LocalAdmissionError && caught.reason === "quota"
              ? t("helpPage.chat.quotaReached")
              : t("helpPage.chat.unavailable"));
          }
        }
      } finally {
        if (pendingRef.current === pending) pendingRef.current = null;
        if (!pending.cancelled) setSubmitting(false);
      }
    })();
  };

  const resetTime = ticket?.resetAt == null
    ? null
    : new Intl.DateTimeFormat(i18n.resolvedLanguage, { hour: "2-digit", minute: "2-digit" }).format(new Date(ticket.resetAt));

  const acceptConsent = () => {
    grantHelpProviderConsent();
    setConsentAccepted(true);
    setShowConsent(false);
  };

  return (
    <div className={open ? "fixed inset-0 z-[70] sm:inset-auto sm:bottom-7 sm:right-7" : `fixed right-4 z-40 sm:bottom-7 sm:right-7 ${vaultUnlocked ? "bottom-[calc(4.75rem+var(--safe-area-bottom))]" : "bottom-5"}`}>
      {open && (
        <>
          <div
            className="wisebot-overlay fixed inset-0 cursor-default bg-[var(--modal-overlay)] backdrop-blur-md"
            onClick={closePanel}
            aria-hidden="true"
          />
          <section
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={t("helpPage.chat.title")}
            className="wisebot-panel relative z-10 flex h-[100dvh] w-screen flex-col overflow-hidden bg-background text-foreground sm:mb-3 sm:h-[min(680px,calc(100dvh-7rem))] sm:w-[min(410px,calc(100vw-2rem))] sm:border sm:border-foreground/20 sm:shadow-[0_18px_48px_rgba(16,24,32,0.16)]"
          >
          <header className="grid min-h-14 grid-cols-[3.25rem_1fr_2.75rem_2.75rem_2.75rem] border-b border-border">
            <div className="flex items-center justify-center border-r border-border bg-ocean-primary">
              <button type="button" onClick={closePanel} aria-label={t("common.back")} className="flex h-full w-full items-center justify-center sm:hidden">
                <ArrowLeft className="h-5 w-5 text-white" />
              </button>
              <Logo variant="icon" className="hidden h-7 w-7 sm:block" />
            </div>
            <div className="min-w-0 px-3 py-2.5">
              <h2 className="truncate text-sm font-bold">{t("helpPage.chat.title")}</h2>
              <p className="truncate text-xs text-muted-foreground">{t("helpPage.chat.scope")}</p>
            </div>
            <button type="button" onClick={() => setShowConsent((current) => !current)} className="flex items-center justify-center border-l border-border" aria-label={t("helpPage.chat.consent.review")}>
              <ShieldCheck className="h-4 w-4" />
            </button>
            <button type="button" onClick={resetConversation} className="flex items-center justify-center border-l border-border" aria-label={t("helpPage.chat.newConversation")}>
              <Trash2 className="h-4 w-4" />
            </button>
            <button type="button" onClick={closePanel} className="flex items-center justify-center border-l border-border" aria-label={t("common.close")}>
              <X className="h-4 w-4" />
            </button>
          </header>

          {!online && (
            <div className="flex items-start gap-2 border-b border-border bg-muted px-3 py-2 text-xs text-muted-foreground" role="status">
              <WifiOff className="mt-0.5 h-4 w-4 shrink-0" />
              {t("helpPage.chat.offline")}
            </div>
          )}

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3" aria-live="polite">
            {showConsent && (
              <section className="border border-ocean-primary bg-ocean-wash p-3 text-left" aria-label={t("helpPage.chat.consent.title")}>
                <div className="flex items-start gap-2">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-ocean-primary" />
                  <div>
                    <h3 className="text-sm font-bold">{t("helpPage.chat.consent.title")}</h3>
                    <p className="mt-1 text-xs leading-relaxed text-foreground/70">{t("helpPage.chat.consent.body")}</p>
                    <ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-relaxed text-foreground/70">
                      <li>{t("helpPage.chat.consent.google")}</li>
                      <li>{t("helpPage.chat.consent.scope")}</li>
                      <li>{t("helpPage.chat.consent.sensitive")}</li>
                    </ul>
                    {!consentAccepted && (
                      <Button type="button" size="sm" className="mt-3" onClick={acceptConsent}>
                        {t("helpPage.chat.consent.accept")}
                      </Button>
                    )}
                  </div>
                </div>
              </section>
            )}
            {!showConsent && messages.length === 0 && !online && (
              <div className="grid min-h-full content-center gap-3 px-5 text-left">
                <WifiOff className="h-7 w-7 text-ocean-primary" />
                <p className="text-sm font-semibold">{t("helpPage.chat.offlineFallback")}</p>
                <div className="grid border-t border-border">
                  {sections.slice(0, 3).map((section, index) => (
                    <a key={section.id} href={`#${section.id}`} onClick={closePanel} className="grid grid-cols-[2rem_1fr] border-b border-border py-3 text-sm text-ocean-primary">
                      <span className="font-bold tabular-nums">{String(index + 1).padStart(2, "0")}</span>
                      <span className="font-semibold">{section.title}</span>
                    </a>
                  ))}
                </div>
              </div>
            )}
            {!showConsent && messages.length === 0 && online && (
              <div className="grid min-h-full content-center gap-3 px-5 text-left">
                <Bot className="h-7 w-7 text-ocean-primary" />
                <p className="text-sm font-semibold">{t("helpPage.chat.welcome")}</p>
                <p className="text-xs leading-relaxed text-muted-foreground">{t("helpPage.chat.privacy")}</p>
              </div>
            )}
            {!showConsent && messages.map((message) => (
              <article key={message.id} className={message.role === "user" ? "ml-8 border border-ocean-primary bg-ocean-primary p-3 text-sm text-white" : "mr-5 border-l-2 border-ocean-primary bg-muted p-3 text-sm"}>
                {message.role === "assistant" && message.text.length > 0
                  ? <HelpMessageMarkdown text={message.text} />
                  : <p className="whitespace-pre-wrap leading-relaxed">{message.text || (submitting ? t("helpPage.chat.writing") : t("helpPage.chat.unavailable"))}</p>}
                {message.imageAttached === true && <p className="mt-2 text-xs text-white/75">{t("helpPage.chat.imageAttached")}</p>}
                {message.role === "assistant" && message.text.length > 0 && message.sectionIds != null && (
                  <div className="mt-3 flex flex-wrap gap-1.5 border-t border-foreground/10 pt-2">
                    {message.sectionIds.map((id) => {
                      const section = sections.find((candidate) => candidate.id === id);
                      return section == null ? null : (
                        <a key={id} href={`#${id}`} className="text-xs font-semibold text-ocean-primary underline underline-offset-2">
                          {section.title}
                        </a>
                      );
                    })}
                  </div>
                )}
              </article>
            ))}

            {!showConsent && ticket?.status === "waiting" && (
              <div className="border border-border bg-card p-3 text-xs" role="status">
                <div className="flex items-center gap-2 font-semibold">
                  <LoaderCircle className="h-4 w-4 animate-spin text-ocean-primary" />
                  {t("helpPage.chat.queuePosition", { position: ticket.position })}
                </div>
                <p className="mt-1 text-muted-foreground">{t("helpPage.chat.waitEstimate", { seconds: ticket.estimatedWaitSeconds })}</p>
                <Button type="button" variant="outline" size="sm" className="mt-2" onClick={cancelPending}>{t("common.cancel")}</Button>
              </div>
            )}
            {!showConsent && submitting && ticket?.status !== "waiting" && (
              <Button type="button" variant="outline" size="sm" onClick={cancelPending}>{t("helpPage.chat.stop")}</Button>
            )}
            {!showConsent && error != null && <p className="border-l-2 border-destructive bg-muted p-3 text-xs" role="alert">{error}</p>}
            <div ref={endRef} />
          </div>

          {!showConsent && <footer className="border-t border-border bg-card p-3 pb-[calc(0.75rem+var(--safe-area-bottom))] sm:pb-3">
            {ticket != null && (
              <p className="mb-2 text-[11px] text-muted-foreground">
                {t("helpPage.chat.quota", { count: ticket.remainingUnits })}
                {resetTime == null ? "" : ` · ${t("helpPage.chat.reset", { time: resetTime })}`}
              </p>
            )}
            {imageDataUrl != null && (
              <div className="mb-2 flex items-center gap-2 border border-border p-2">
                <img src={imageDataUrl} alt={t("helpPage.chat.imagePreview")} className="h-12 w-12 object-cover" />
                <span className="min-w-0 flex-1 text-xs text-muted-foreground">{t("helpPage.chat.imageCost")}</span>
                <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => setImageDataUrl(null)} aria-label={t("helpPage.chat.removeImage")}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            )}
            <form onSubmit={handleSubmit} className="grid grid-cols-[2.5rem_1fr_2.5rem] items-end gap-2">
              <input ref={fileInputRef} type="file" accept="image/*" className="sr-only" onChange={handleFile} />
              <Button type="button" variant="outline" size="icon" disabled={!online || submitting || imageBusy} onClick={() => fileInputRef.current?.click()} aria-label={t("helpPage.chat.addImage")}>
                {imageBusy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
              </Button>
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onPaste={handlePaste}
                maxLength={2000}
                rows={2}
                disabled={!online || submitting}
                placeholder={t("helpPage.chat.placeholder")}
                aria-label={t("helpPage.chat.placeholder")}
                className="min-h-10 resize-none border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:border-primary"
              />
              <Button type="submit" size="icon" disabled={!online || submitting || imageBusy || input.trim().length === 0} aria-label={t("helpPage.chat.send")}>
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </footer>}
          </section>
        </>
      )}

      {!open && (
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            onOpenChange?.(true);
          }}
          className={`${window.location.pathname === "/help" ? "hidden sm:flex" : "flex"} h-12 w-12 items-center justify-center border border-ocean-primary bg-card shadow-[0_8px_24px_rgba(16,24,32,0.14)] transition-transform hover:-translate-y-0.5 sm:h-14 sm:w-14`}
          aria-label={t("helpPage.chat.open")}
          title={t("helpPage.chat.open")}
        >
          {online ? <Logo variant="icon" className="h-8 w-8" /> : <WifiOff className="h-5 w-5 text-muted-foreground" />}
        </button>
      )}
    </div>
  );
}
