import { ArrowLeft, ArrowUp, BookOpen, ImagePlus, LoaderCircle, MoreVertical, ShieldCheck, Square, Trash2, WifiOff, X } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent, type ClipboardEvent, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import Logo from "../components/Logo.tsx";
import { Button } from "../components/ui/button.tsx";
import { TypingDots } from "../components/ui/typing-dots.tsx";
import { findRelevantHelpSections, localTaskAnswer, type HelpSection } from "./corpus.ts";
import { openHelp } from "./navigation.ts";
import { suggestedTasks } from "./suggestions.ts";
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
  launcherHidden = false,
}: {
  sections: HelpSection[];
  openRequest: number;
  initialPrompt?: string;
  safeContext: SafeHelpContext;
  onOpenChange?: (open: boolean) => void;
  vaultUnlocked: boolean;
  launcherHidden?: boolean;
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
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
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
        if (menuRef.current?.querySelector("[role=menu]") != null) setMenuOpen(false);
        else closePanel();
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
    ask(input.trim());
  };

  const ask = (question: string) => {
    if (question.length === 0 || !online || submitting || imageBusy || !consentAccepted) return;

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
  };

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: PointerEvent) => {
      if (menuRef.current != null && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [menuOpen]);

  const openGuide = (sectionId: string) => {
    closePanel();
    openHelp(sectionId);
  };

  const suggestions = suggestedTasks(sections, safeContext.surfaceId);
  const suggest = (title: string) => {
    if (consentAccepted) ask(title);
    else setInput(title);
  };
  const busy = submitting || imageBusy;

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
            data-state="open"
            aria-label={t("helpPage.chat.title")}
            className="wisebot-panel relative z-10 flex h-[100dvh] w-screen flex-col overflow-hidden bg-background text-foreground sm:mb-3 sm:h-[min(680px,calc(100dvh-7rem))] sm:w-[min(410px,calc(100vw-2rem))] sm:rounded-2xl sm:border sm:border-foreground/20 sm:shadow-[0_18px_48px_rgba(16,24,32,0.16)]"
          >
          <header className="flex min-h-14 items-center gap-2 border-b border-border px-2">
            <button type="button" onClick={closePanel} aria-label={t("common.back")} className="flex h-10 w-10 items-center justify-center rounded-full sm:hidden">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <span className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ocean-wash sm:flex" aria-hidden="true">
              <Logo variant="icon" className="h-6 w-6" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-sm font-bold">{t("helpPage.chat.title")}</h2>
              <p className="truncate text-xs text-muted-foreground">{online ? t("helpPage.chat.status.ready") : t("helpPage.chat.status.offline")}</p>
            </div>
            <button type="button" onClick={() => { closePanel(); openHelp(); }} className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-muted" aria-label={t("helpPage.chat.openGuide")} title={t("helpPage.chat.openGuide")}>
              <BookOpen className="h-5 w-5" />
            </button>
            <div ref={menuRef} className="relative">
              <button type="button" onClick={() => setMenuOpen((current) => !current)} aria-haspopup="menu" aria-expanded={menuOpen} className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-muted" aria-label={t("helpPage.chat.menu")}>
                <MoreVertical className="h-5 w-5" />
              </button>
              {menuOpen && (
                <div role="menu" aria-label={t("helpPage.chat.menu")} className="absolute right-0 top-11 z-20 min-w-48 rounded-lg border border-border bg-popover p-1 text-sm text-popover-foreground shadow-lg">
                  <button type="button" role="menuitem" onClick={() => { setShowPrivacy((current) => !current); setMenuOpen(false); }} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left hover:bg-accent hover:text-accent-foreground">
                    <ShieldCheck className="h-4 w-4 text-ocean-primary" />{t("helpPage.chat.consent.review")}
                  </button>
                  <button type="button" role="menuitem" onClick={() => { resetConversation(); setMenuOpen(false); }} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left hover:bg-accent hover:text-accent-foreground">
                    <Trash2 className="h-4 w-4 text-ocean-primary" />{t("helpPage.chat.newConversation")}
                  </button>
                </div>
              )}
            </div>
            <button type="button" onClick={closePanel} className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-muted" aria-label={t("common.close")}>
              <X className="h-5 w-5" />
            </button>
          </header>

          {!online && (
            <div className="flex items-start gap-2 border-b border-border bg-muted px-3 py-2 text-xs text-muted-foreground" role="status">
              <WifiOff className="mt-0.5 h-4 w-4 shrink-0" />
              {t("helpPage.chat.offline")}
            </div>
          )}

          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-4 py-4" aria-live="polite">
            {showPrivacy && (
              <section className="rounded-lg border border-ocean-primary bg-ocean-wash p-3 text-left" aria-label={t("helpPage.chat.consent.title")}>
                <div className="flex items-start gap-2">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-ocean-primary" />
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-bold">{t("helpPage.chat.consent.title")}</h3>
                    <ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-relaxed text-foreground/70">
                      <li>{t("helpPage.chat.consent.google")}</li>
                      <li>{t("helpPage.chat.consent.scope")}</li>
                      <li>{t("helpPage.chat.consent.sensitive")}</li>
                    </ul>
                  </div>
                  <button type="button" onClick={() => setShowPrivacy(false)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-background/60" aria-label={t("helpPage.chat.consent.hide")}>
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </section>
            )}
            {messages.length === 0 && !online && (
              <div className="grid min-h-full content-center gap-3 px-2 text-left">
                <WifiOff className="h-7 w-7 text-ocean-primary" />
                <p className="text-sm font-semibold">{t("helpPage.chat.offlineFallback")}</p>
                <div className="grid gap-2">
                  {suggestions.map((section) => (
                    <button key={section.id} type="button" onClick={() => openGuide(section.id)} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2.5 text-left text-sm font-semibold text-ocean-primary hover:bg-muted">
                      <BookOpen className="h-4 w-4 shrink-0" />{section.title}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.length === 0 && online && (
              <div className="flex min-h-full flex-col items-center justify-center gap-5 px-1 py-6 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-ocean-wash" aria-hidden="true">
                  <Logo variant="icon" className="h-8 w-8" />
                </span>
                <p className="text-lg font-semibold tracking-tight">{t("helpPage.chat.welcome")}</p>
                <ul className="grid w-full gap-2" aria-label={t("helpPage.chat.suggestions")}>
                  {suggestions.map((section) => (
                    <li key={section.id}>
                      <button type="button" onClick={() => suggest(section.title)} disabled={busy} className="min-h-11 w-full rounded-2xl border border-border bg-card px-4 py-3 text-left text-sm leading-snug text-foreground transition-colors hover:bg-muted disabled:opacity-50">
                        {section.title}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {messages.map((message) => (
              <article key={message.id} className={message.role === "user" ? "flex justify-end" : "min-w-0"}>
                <div className={message.role === "user"
                  ? "max-w-[85%] rounded-3xl bg-muted px-4 py-2.5 text-[0.9375rem] text-foreground"
                  : "text-[0.9375rem] leading-relaxed text-foreground"}>
                  {message.role === "assistant" && message.text.length > 0
                    ? <HelpMessageMarkdown text={message.text} />
                    : message.role === "assistant" && submitting
                      ? <TypingDots label={t("helpPage.chat.writing")} />
                      : <p className="whitespace-pre-wrap leading-relaxed">{message.text || t("helpPage.chat.unavailable")}</p>}
                  {message.imageAttached === true && <p className="mt-1 text-xs text-muted-foreground">{t("helpPage.chat.imageAttached")}</p>}
                  {message.role === "assistant" && message.text.length > 0 && message.sectionIds != null && message.sectionIds.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {message.sectionIds.map((id) => {
                        const section = sections.find((candidate) => candidate.id === id);
                        return section == null ? null : (
                          <button key={id} type="button" onClick={() => openGuide(id)} className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-muted px-3 text-xs text-muted-foreground hover:bg-ocean-wash hover:text-foreground" aria-label={t("helpPage.chat.guideLink", { title: section.title })}>
                            <BookOpen className="h-3.5 w-3.5 shrink-0 text-ocean-primary" />{section.title}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </article>
            ))}

            {ticket?.status === "waiting" && (
              <div className="rounded-lg border border-border bg-card p-3 text-xs" role="status">
                <div className="flex items-center gap-2 font-semibold">
                  <LoaderCircle className="h-4 w-4 animate-spin text-ocean-primary" />
                  {t("helpPage.chat.queuePosition", { position: ticket.position })}
                </div>
                <p className="mt-1 text-muted-foreground">{t("helpPage.chat.waitEstimate", { seconds: ticket.estimatedWaitSeconds })}</p>
                <Button type="button" variant="outline" size="sm" className="mt-2" onClick={cancelPending}>{t("common.cancel")}</Button>
              </div>
            )}
            {error != null && <p className="rounded-lg border-l-2 border-destructive bg-muted p-3 text-xs" role="alert">{error}</p>}
            <div ref={endRef} />
          </div>

          <footer className="bg-background px-3 pb-[calc(0.75rem+var(--safe-area-bottom))] pt-1 sm:pb-3">
            {!consentAccepted && (
              <div className="mb-2 flex items-center gap-2 rounded-2xl bg-ocean-wash px-3 py-1.5 text-xs" role="note">
                <ShieldCheck className="h-4 w-4 shrink-0 text-ocean-primary" />
                <span className="min-w-0 flex-1 leading-snug">{t("helpPage.chat.consent.line")}</span>
                <Button type="button" size="sm" className="h-11 min-w-11 rounded-full" onClick={acceptConsent}>{t("helpPage.chat.consent.ok")}</Button>
              </div>
            )}
            {ticket != null && (
              <p className="mb-2 text-xs text-muted-foreground">
                {t("helpPage.chat.quota", { count: ticket.remainingUnits })}
                {resetTime == null ? "" : ` · ${t("helpPage.chat.reset", { time: resetTime })}`}
              </p>
            )}
            {imageDataUrl != null && (
              <div className="mb-2 flex items-center gap-2 rounded-2xl border border-border p-2">
                <img src={imageDataUrl} alt={t("helpPage.chat.imagePreview")} className="h-12 w-12 rounded-xl object-cover" />
                <span className="min-w-0 flex-1 text-xs text-muted-foreground">{t("helpPage.chat.imageCost")}</span>
                <Button type="button" size="icon" variant="ghost" className="h-11 w-11" onClick={() => setImageDataUrl(null)} aria-label={t("helpPage.chat.removeImage")}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            )}
            <form onSubmit={handleSubmit} className="flex items-end gap-1 rounded-[1.75rem] border border-border bg-card p-1.5 shadow-[0_4px_20px_rgba(16,24,32,0.08)] focus-within:border-ocean-primary/50">
              <input ref={fileInputRef} type="file" accept="image/*" className="sr-only" onChange={handleFile} />
              <Button type="button" variant="ghost" size="icon" className="shrink-0 rounded-full text-muted-foreground" disabled={!online || busy} onClick={() => fileInputRef.current?.click()} aria-label={t("helpPage.chat.addImage")}>
                {imageBusy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
              </Button>
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onPaste={handlePaste}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    ask(input.trim());
                  }
                }}
                maxLength={2000}
                rows={1}
                disabled={!online || submitting}
                placeholder={t("helpPage.chat.placeholder")}
                aria-label={t("helpPage.chat.placeholder")}
                className="max-h-32 min-h-11 flex-1 resize-none bg-transparent px-1 py-2.5 text-base text-foreground placeholder:text-muted-foreground focus-visible:outline-none sm:text-sm"
              />
              {submitting && ticket?.status !== "waiting"
                ? <Button type="button" size="icon" className="shrink-0 rounded-full bg-foreground text-background hover:bg-foreground/85" onClick={cancelPending} aria-label={t("helpPage.chat.stop")}><Square className="h-3.5 w-3.5 fill-current" /></Button>
                : <Button type="submit" size="icon" className="shrink-0 rounded-full bg-foreground text-background hover:bg-foreground/85 disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100" disabled={!online || busy || !consentAccepted || input.trim().length === 0} aria-label={t("helpPage.chat.send")}><ArrowUp className="h-5 w-5" /></Button>}
            </form>
          </footer>
          </section>
        </>
      )}

      {!open && !launcherHidden && (
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            onOpenChange?.(true);
          }}
          className={`${window.location.pathname === "/help" ? "hidden sm:flex" : "flex"} h-12 w-12 items-center justify-center rounded-full border border-ocean-primary bg-card shadow-[0_8px_24px_rgba(16,24,32,0.14)] transition-transform hover:-translate-y-0.5 sm:h-14 sm:w-14`}
          aria-label={t("helpPage.chat.open")}
          title={t("helpPage.chat.open")}
        >
          {online ? <Logo variant="icon" className="h-8 w-8" /> : <WifiOff className="h-5 w-5 text-muted-foreground" />}
        </button>
      )}
    </div>
  );
}
