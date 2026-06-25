import { useState, useCallback, useEffect, useRef, type FormEvent } from "react";
import { useFinancialState } from "../../hooks/useFinancialState.ts";
import { useMasterKey } from "../../lib/masterKeyContext.ts";
import { requestInsight, requestRecommendation, requestPrediction, detectPatterns } from "../../pillars/intelligence/index.ts";
import { sendConversationMessage, loadConceptEntry } from "../../pillars/literacy/index.ts";
import { getConsentLevel, setConsentLevel, markNotPrompted, revokeConsent } from "../../consent/consentStore.ts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../components/ui/card.tsx";
import { Button } from "../../components/ui/button.tsx";
import { Input } from "../../components/ui/input.tsx";
import { Separator } from "../../components/ui/separator.tsx";
import { Skeleton } from "../../components/ui/skeleton.tsx";
import { Badge } from "../../components/ui/badge.tsx";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  DialogFooter,
} from "../../components/ui/dialog.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs.tsx";
import {
  Lightbulb, Sparkles, TrendingUp, AlertCircle, BookOpen,
  Send, Shield, X, Settings2, Key,
} from "lucide-react";
import type { AIResult, IntelligenceFeatureId } from "../../pillars/intelligence/index.ts";
import type { ProviderUnavailableSignal } from "../../ai/orchestration.ts";
import { getAICapability, type AICapability } from "../../lib/capabilities.ts";
import { useTranslation } from "react-i18next";

type FeatureId = IntelligenceFeatureId | "literacy";

function isUnavailable(result: AIResult): result is ProviderUnavailableSignal {
  return "unavailable" in result && result.unavailable === true;
}

interface InsightEntry {
  id: string;
  featureId: FeatureId;
  result: AIResult;
}

interface Message {
  role: "user" | "assistant";
  text: string;
}

let entryCounter = 0;

const CONSENT_FEATURES: FeatureId[] = ["insight", "recommendation", "prediction", "pattern_detection", "literacy"];

export default function Assistant() {
  const { t } = useTranslation();
  const masterKey = useMasterKey();
  const { data: snapshot, isLoading } = useFinancialState();

  const [chatMessages, setChatMessages] = useState<Message[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatSubmitting, setChatSubmitting] = useState(false);

  const [insightFeed, setInsightFeed] = useState<InsightEntry[]>([]);
  const [insightLoading, setInsightLoading] = useState<FeatureId | null>(null);

  const [conceptId, setConceptId] = useState<string | null>(null);

  const [consentDialog, setConsentDialog] = useState<FeatureId | null>(null);
  const [showConsentSettings, setShowConsentSettings] = useState(false);
  const [aiCapability, setAiCapability] = useState<AICapability | null>(null);
  const pendingChatMsg = useRef<string | null>(null);

  useEffect(() => {
    void getAICapability(masterKey).then(setAiCapability);
  }, [masterKey]);

  const FEATURE_META: Record<FeatureId, {
    name: string;
    purpose: string;
    provider: string;
    description: string;
    redactedData: string;
    fullData: string;
    icon: React.ReactNode;
  }> = {
    insight: {
      name: t("assistant.features.insight.name"),
      purpose: t("assistant.features.insight.purpose"),
      provider: t("assistant.features.insight.provider"),
      description: t("assistant.features.insight.description"),
      redactedData: t("assistant.features.insight.redactedData"),
      fullData: t("assistant.features.insight.fullData"),
      icon: <Lightbulb className="h-4 w-4" />,
    },
    recommendation: {
      name: t("assistant.features.recommendation.name"),
      purpose: t("assistant.features.recommendation.purpose"),
      provider: t("assistant.features.recommendation.provider"),
      description: t("assistant.features.recommendation.description"),
      redactedData: t("assistant.features.recommendation.redactedData"),
      fullData: t("assistant.features.recommendation.fullData"),
      icon: <Sparkles className="h-4 w-4" />,
    },
    prediction: {
      name: t("assistant.features.prediction.name"),
      purpose: t("assistant.features.prediction.purpose"),
      provider: t("assistant.features.prediction.provider"),
      description: t("assistant.features.prediction.description"),
      redactedData: t("assistant.features.prediction.redactedData"),
      fullData: t("assistant.features.prediction.fullData"),
      icon: <TrendingUp className="h-4 w-4" />,
    },
    pattern_detection: {
      name: t("assistant.features.patternDetection.name"),
      purpose: t("assistant.features.patternDetection.purpose"),
      provider: t("assistant.features.patternDetection.provider"),
      description: t("assistant.features.patternDetection.description"),
      redactedData: t("assistant.features.patternDetection.redactedData"),
      fullData: t("assistant.features.patternDetection.fullData"),
      icon: <AlertCircle className="h-4 w-4" />,
    },
    literacy: {
      name: t("assistant.features.literacy.name"),
      purpose: t("assistant.features.literacy.purpose"),
      provider: t("assistant.features.literacy.provider"),
      description: t("assistant.features.literacy.description"),
      redactedData: t("assistant.features.literacy.redactedData"),
      fullData: t("assistant.features.literacy.fullData"),
      icon: <BookOpen className="h-4 w-4" />,
    },
  };

  const aiAvailable = aiCapability?.available === true;
  const aiUnavailableMessage = aiCapability?.message ?? t("assistant.checkingSetup");

  const handleChatSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || snapshot == null || !aiAvailable) return;
    const userMsg = chatInput.trim();
    setChatInput("");
    setChatMessages((prev) => [...prev, { role: "user", text: userMsg }]);
    const consent = getConsentLevel("literacy");
    if (consent === "NotPrompted") {
      pendingChatMsg.current = userMsg;
      markNotPrompted("literacy");
      setConsentDialog("literacy");
      return;
    }
    void sendChatMessage(userMsg);
  };

  const sendChatMessage = async (text: string) => {
    if (snapshot == null || !aiAvailable) return;
    setChatSubmitting(true);
    try {
      const result = await sendConversationMessage("literacy", text, snapshot, masterKey);
      if (isUnavailable(result)) {
        setChatMessages((prev) => [...prev, { role: "assistant", text: result.message }]);
      } else {
        setChatMessages((prev) => [...prev, { role: "assistant", text: result.text }]);
      }
    } catch (err) {
      setChatMessages((prev) => [...prev, { role: "assistant", text: err instanceof Error ? err.message : t("assistant.chat.error") }]);
    } finally {
      setChatSubmitting(false);
    }
  };

  const addToFeed = useCallback((featureId: FeatureId, result: AIResult) => {
    const id = `entry-${++entryCounter}`;
    setInsightFeed((prev) => [...prev, { id, featureId, result }]);
  }, []);

  const dismissEntry = useCallback((id: string) => {
    setInsightFeed((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const handleFeatureRequest = (featureId: FeatureId) => {
    if (snapshot == null || !aiAvailable) return;
    const consent = getConsentLevel(featureId);
    if (consent === "NotPrompted") {
      markNotPrompted(featureId);
      setConsentDialog(featureId);
      return;
    }
    executeFeature(featureId);
  };

  const executeFeature = (featureId: FeatureId) => {
    if (snapshot == null || !aiAvailable) return;
    setInsightLoading(featureId);
    void (async () => {
      try {
        let result: AIResult;
        switch (featureId) {
          case "insight":
            result = await requestInsight(featureId, snapshot, masterKey);
            break;
          case "recommendation":
            result = await requestRecommendation(featureId, snapshot, masterKey);
            break;
          case "prediction":
            result = await requestPrediction(featureId, snapshot, masterKey);
            break;
          case "pattern_detection":
            result = await detectPatterns(featureId, snapshot, masterKey);
            break;
          case "literacy":
            return;
        }
        addToFeed(featureId, result);
      } finally {
        setInsightLoading(null);
      }
    })();
  };

  const handleConsentFull = () => {
    if (consentDialog == null) return;
    const fid = consentDialog;
    setConsentLevel(fid, "FullGranted");
    setConsentDialog(null);
    if (fid === "literacy") {
      const msg = pendingChatMsg.current;
      pendingChatMsg.current = null;
      if (msg != null) void sendChatMessage(msg);
      return;
    }
    void executeFeature(fid);
  };

  const handleConsentRedacted = () => {
    if (consentDialog == null) return;
    const fid = consentDialog;
    revokeConsent(fid);
    setConsentDialog(null);
    if (fid === "literacy") {
      const msg = pendingChatMsg.current;
      pendingChatMsg.current = null;
      if (msg != null) void sendChatMessage(msg);
      return;
    }
    void executeFeature(fid);
  };

  const handleConsentDeny = () => {
    setConsentDialog(null);
  };

  const consentFeature = consentDialog != null ? FEATURE_META[consentDialog] : null;

  const conceptEntry = conceptId != null ? loadConceptEntry(conceptId) : null;

  if (isLoading) {
    return (
      <main aria-label={t("assistant.title")} className="app-page">
        <h1 className="page-title">{t("assistant.title")}</h1>
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
      </main>
    );
  }

  return (
    <main aria-label={t("assistant.title")} className="app-page">
      <div className="page-head">
        <div>
          <p className="page-kicker">{t("assistant.title")}</p>
          <h1 className="page-title">{t("assistant.heading")}</h1>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setShowConsentSettings(true)} aria-label={t("assistant.consentSettings")}>
          <Settings2 className="h-5 w-5" />
        </Button>
      </div>

      <Tabs defaultValue="insights">
        <TabsList className="grid w-full grid-cols-2 sm:w-[360px]">
          <TabsTrigger value="insights"><Lightbulb className="h-4 w-4 mr-1" />{t("assistant.tabs.insights")}</TabsTrigger>
          <TabsTrigger value="chat"><BookOpen className="h-4 w-4 mr-1" />{t("assistant.tabs.learn")}</TabsTrigger>
        </TabsList>

        <TabsContent value="insights" className="space-y-4">
          {!aiAvailable && (
            <AISetupNotice message={aiUnavailableMessage} />
          )}
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {(["insight", "recommendation", "prediction", "pattern_detection"] as const).map((feat) => {
              const meta = FEATURE_META[feat];
              const loading = insightLoading === feat;
              return (
                <Button
                  key={feat}
                  variant="outline"
                  className="h-14 justify-start gap-2 px-3"
                  onClick={() => handleFeatureRequest(feat)}
                  disabled={!aiAvailable || loading || insightLoading != null}
                >
                  {meta.icon}
                  <span className="truncate text-sm">{loading ? t("assistant.thinking") : meta.name}</span>
                </Button>
              );
            })}
          </div>

          {insightFeed.length > 0 && (
            <section aria-label={t("assistant.title")} className="space-y-3">
              {insightFeed.map((entry) => {
                const meta = FEATURE_META[entry.featureId] ?? FEATURE_META.insight;
                return (
                  <Card key={entry.id}>
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          {meta.icon}
                          <CardTitle className="text-sm">
                            {isUnavailable(entry.result) ? t("assistant.unavailable") : meta.name}
                          </CardTitle>
                        </div>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => dismissEntry(entry.id)} aria-label={t("assistant.dismiss")}>
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                      <CardDescription className="text-xs">{meta.provider}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {isUnavailable(entry.result) ? (
                        <div className="flex items-start gap-2 text-muted-foreground">
                          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
                          <p className="text-sm">{entry.result.message}</p>
                        </div>
                      ) : (
                        <p className="text-sm whitespace-pre-wrap">{entry.result.text}</p>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </section>
          )}

          {insightFeed.length === 0 && insightLoading == null && (
            <p className="empty-state">
              {aiAvailable ? t("assistant.emptyInsights") : t("assistant.emptyPaused")}
            </p>
          )}

          <Separator />

          <Card className="max-w-4xl">
            <CardHeader>
              <CardTitle className="text-base">{t("assistant.conceptLibrary.title")}</CardTitle>
              <CardDescription>{t("assistant.conceptLibrary.description")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex flex-wrap gap-2">
                {["budgeting-101", "compound-interest", "emergency-fund"].map((id) => (
                  <Button
                    key={id}
                    variant={conceptId === id ? "default" : "outline"}
                    size="sm"
                    onClick={() => setConceptId(conceptId === id ? null : id)}
                  >
                    {id === "budgeting-101" ? t("assistant.conceptLibrary.budgeting101") : id === "compound-interest" ? t("assistant.conceptLibrary.compoundInterest") : t("assistant.conceptLibrary.emergencyFund")}
                  </Button>
                ))}
              </div>
              {conceptEntry != null && (
                <div className="mt-4 rounded-lg bg-muted p-3">
                  <h3 className="font-semibold text-sm mb-1">{conceptEntry.title}</h3>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{conceptEntry.body}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="chat">
          <Card className="flex h-[60dvh] max-w-4xl flex-col">
            <CardHeader className="border-b pb-3">
              <CardTitle className="text-base">{t("assistant.chat.title")}</CardTitle>
              <CardDescription>{aiAvailable ? t("assistant.chat.description") : t("assistant.chat.paused")}</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto space-y-3 py-4">
              {!aiAvailable ? (
                <AISetupNotice message={aiUnavailableMessage} />
              ) : chatMessages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground space-y-2">
                  <BookOpen className="h-8 w-8" />
                  <p className="text-sm">{t("assistant.chat.emptyTitle")}</p>
                  <p className="text-xs">{t("assistant.chat.emptyExample")}</p>
                </div>
              )}
              {chatMessages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-foreground"
                    }`}
                  >
                    {msg.text}
                  </div>
                </div>
              ))}
              {chatSubmitting && (
                <div className="flex justify-start">
                  <div className="max-w-[80%] rounded-lg px-3 py-2 text-sm bg-muted text-muted-foreground">
                    {t("assistant.chat.thinking")}
                  </div>
                </div>
              )}
            </CardContent>
            <div className="border-t p-4">
              <form onSubmit={handleChatSubmit} className="flex gap-2">
                <Input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder={t("assistant.chat.placeholder")}
                  disabled={!aiAvailable || chatSubmitting || snapshot == null}
                  className="flex-1"
                />
                <Button type="submit" disabled={!aiAvailable || chatSubmitting || chatInput.trim().length === 0 || snapshot == null} size="icon">
                  <Send className="h-4 w-4" />
                </Button>
              </form>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={consentDialog != null} onOpenChange={(open) => { if (!open) setConsentDialog(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              {consentFeature?.name ?? t("assistant.consent.title")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <DialogDescription>
              {consentFeature?.description}
            </DialogDescription>
            <div className="space-y-2 text-sm">
              <p>
                <strong>{t("assistant.consent.provider")}:</strong> {consentFeature?.provider}
              </p>
              <p>
                <strong>{t("assistant.consent.purpose")}:</strong> {consentFeature?.purpose}
              </p>
              <div className="rounded-lg border p-3 space-y-2">
                <div>
                  <Badge variant="secondary" className="mb-1">{t("assistant.consent.limited")}</Badge>
                  <p className="text-xs text-muted-foreground">{consentFeature?.redactedData}</p>
                </div>
                <Separator />
                <div>
                  <Badge className="mb-1">{t("assistant.consent.full")}</Badge>
                  <p className="text-xs text-muted-foreground">{consentFeature?.fullData}</p>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={handleConsentDeny}>{t("assistant.consent.notNow")}</Button>
            {consentDialog !== "literacy" && (
              <Button variant="outline" onClick={handleConsentRedacted}>{t("assistant.consent.useLimited")}</Button>
            )}
            <Button onClick={handleConsentFull}>{t("assistant.consent.grantFull")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showConsentSettings} onOpenChange={setShowConsentSettings}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              {t("assistant.consent.settingsTitle")}
            </DialogTitle>
            <DialogDescription>
              {t("assistant.consent.settingsDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 max-h-[50vh] overflow-y-auto">
            {CONSENT_FEATURES.map((fid) => {
              const level = getConsentLevel(fid);
              const meta = FEATURE_META[fid];
              return (
                <div key={fid} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="text-sm font-medium">{meta.name}</p>
                      <p className="text-xs text-muted-foreground">{meta.provider}</p>
                    </div>
                    <Badge variant={level === "FullGranted" ? "default" : "secondary"} className="text-xs">
                      {level === "FullGranted" ? t("assistant.consent.statusFull") : level === "NotPrompted" ? t("assistant.consent.statusNotPrompted") : t("assistant.consent.statusLimited")}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">{meta.description}</p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant={level === "FullGranted" ? "default" : "outline"}
                      onClick={() => {
                        setConsentLevel(fid, "FullGranted");
                        setShowConsentSettings(false);
                      }}
                    >
                      {t("assistant.consent.fullBtn")}
                    </Button>
                    <Button
                      size="sm"
                      variant={level === "Redacted" ? "default" : "outline"}
                      onClick={() => {
                        revokeConsent(fid);
                      }}
                    >
                      {t("assistant.consent.limitedBtn")}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <Button onClick={() => setShowConsentSettings(false)}>{t("assistant.consent.done")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function AISetupNotice({ message }: { message: string }) {
  const { t } = useTranslation();
  return (
    <Card className="border-ocean-primary/30 bg-ocean-wash/70">
      <CardContent className="flex flex-col gap-3 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <Key className="mt-0.5 h-5 w-5 shrink-0 text-ocean-primary" />
          <div>
            <p className="text-sm font-semibold">{t("assistant.aiNoticeTitle")}</p>
            <p className="mt-1 text-sm text-muted-foreground">{message}</p>
          </div>
        </div>
        <Button asChild size="sm" className="shrink-0">
          <a href="/settings">{t("assistant.aiNoticeAction")}</a>
        </Button>
      </CardContent>
    </Card>
  );
}
