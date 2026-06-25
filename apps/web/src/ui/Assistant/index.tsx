import { useState, useCallback, useRef, type FormEvent } from "react";
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
  Send, Shield, X, Settings2,
} from "lucide-react";
import type { AIResult, IntelligenceFeatureId } from "../../pillars/intelligence/index.ts";
import type { ProviderUnavailableSignal } from "../../ai/orchestration.ts";

type FeatureId = IntelligenceFeatureId | "literacy";

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
    name: "Spending Insight",
    purpose: "Analyse your spending patterns and surface observations",
    provider: "Google Gemini (free tier)",
    description: "Finds anomalies, trends, and notable changes in your finances",
    redactedData: "Period totals, category breakdown, budget status — no individual transactions",
    fullData: "Individual transaction amounts, dates, categories, and notes",
    icon: <Lightbulb className="h-4 w-4" />,
  },
  recommendation: {
    name: "Recommendation",
    purpose: "Suggest concrete actions to improve your financial situation",
    provider: "Google Gemini (free tier)",
    description: "Generates budget adjustments, savings suggestions, and spending trade-offs",
    redactedData: "Period totals, budget progress, goal progress — no individual transactions",
    fullData: "Individual transaction amounts, dates, categories, and notes",
    icon: <Sparkles className="h-4 w-4" />,
  },
  prediction: {
    name: "Prediction",
    purpose: "Project end-of-month balance and budget exhaustion dates",
    provider: "Google Gemini (free tier)",
    description: "Forecasts your financial trajectory based on current data and recurring items",
    redactedData: "Period income/expenses, projected recurring items, budget limits — no individual transactions",
    fullData: "Individual transaction amounts, dates, categories, and notes",
    icon: <TrendingUp className="h-4 w-4" />,
  },
  pattern_detection: {
    name: "Pattern Detection",
    purpose: "Detect recurring spending habits and category dependencies",
    provider: "Google Gemini (free tier)",
    description: "Identifies behavioural patterns like frequent dining, subscription creep, or category concentration",
    redactedData: "Category-level aggregates, budget status, period comparisons — no individual transactions",
    fullData: "Individual transaction amounts, dates, categories, and notes",
    icon: <AlertCircle className="h-4 w-4" />,
  },
  literacy: {
    name: "Learning Chat",
    purpose: "Explain personal finance concepts in plain language",
    provider: "Google Gemini (free tier)",
    description: "Answers questions about budgeting, saving, cash flow, and more — tied to your data",
    redactedData: "Period totals, category breakdown, budget status — no individual transactions",
    fullData: "Individual transaction amounts, dates, categories, and notes",
    icon: <BookOpen className="h-4 w-4" />,
  },
};

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
  const pendingChatMsg = useRef<string | null>(null);

  const handleChatSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || snapshot == null) return;
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
    if (snapshot == null) return;
    setChatSubmitting(true);
    try {
      const result = await sendConversationMessage("literacy", text, snapshot, masterKey);
      if (isUnavailable(result)) {
        setChatMessages((prev) => [...prev, { role: "assistant", text: result.message }]);
      } else {
        setChatMessages((prev) => [...prev, { role: "assistant", text: result.text }]);
      }
    } catch (err) {
      setChatMessages((prev) => [...prev, { role: "assistant", text: err instanceof Error ? err.message : "Something went wrong." }]);
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
    if (snapshot == null) return;
    const consent = getConsentLevel(featureId);
    if (consent === "NotPrompted") {
      markNotPrompted(featureId);
      setConsentDialog(featureId);
      return;
    }
    executeFeature(featureId);
  };

  const executeFeature = (featureId: FeatureId) => {
    if (snapshot == null) return;
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
      <main aria-label="AI assistant" className="app-page">
        <h1 className="page-title">Assistant</h1>
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
      </main>
    );
  }

  return (
    <main aria-label="AI assistant" className="app-page">
      <div className="page-head">
        <div>
          <p className="page-kicker">Assistant</p>
          <h1 className="page-title">Insights and Learning</h1>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setShowConsentSettings(true)} aria-label="Consent settings">
          <Settings2 className="h-5 w-5" />
        </Button>
      </div>

      <Tabs defaultValue="insights">
        <TabsList className="grid w-full grid-cols-2 sm:w-[360px]">
          <TabsTrigger value="insights"><Lightbulb className="h-4 w-4 mr-1" />Insights</TabsTrigger>
          <TabsTrigger value="chat"><BookOpen className="h-4 w-4 mr-1" />Learn</TabsTrigger>
        </TabsList>

        <TabsContent value="insights" className="space-y-4">
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
                  disabled={loading || insightLoading != null}
                >
                  {meta.icon}
                  <span className="truncate text-sm">{loading ? "Thinking…" : meta.name}</span>
                </Button>
              );
            })}
          </div>

          {insightFeed.length > 0 && (
            <section aria-label="Insight feed" className="space-y-3">
              {insightFeed.map((entry) => {
                const meta = FEATURE_META[entry.featureId] ?? FEATURE_META.insight;
                return (
                  <Card key={entry.id}>
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          {meta.icon}
                          <CardTitle className="text-sm">
                            {isUnavailable(entry.result) ? "Unavailable" : meta.name}
                          </CardTitle>
                        </div>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => dismissEntry(entry.id)} aria-label="Dismiss">
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
              Tap a button above to generate insights from your financial data.
            </p>
          )}

          <Separator />

          <Card className="max-w-4xl">
            <CardHeader>
              <CardTitle className="text-base">Concept Library</CardTitle>
              <CardDescription>Learn at your own pace</CardDescription>
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
                    {id === "budgeting-101" ? "Budgeting 101" : id === "compound-interest" ? "Compound Interest" : "Emergency Fund"}
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
              <CardTitle className="text-base">Financial Literacy Chat</CardTitle>
              <CardDescription>Ask anything about personal finance</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto space-y-3 py-4">
              {chatMessages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground space-y-2">
                  <BookOpen className="h-8 w-8" />
                  <p className="text-sm">Ask a question to start learning</p>
                  <p className="text-xs">e.g. "What is the 50/30/20 rule?"</p>
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
                    Thinking…
                  </div>
                </div>
              )}
            </CardContent>
            <div className="border-t p-4">
              <form onSubmit={handleChatSubmit} className="flex gap-2">
                <Input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Ask a question…"
                  disabled={chatSubmitting || snapshot == null}
                  className="flex-1"
                />
                <Button type="submit" disabled={chatSubmitting || chatInput.trim().length === 0 || snapshot == null} size="icon">
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
              {consentFeature?.name ?? "Full Access Required"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <DialogDescription>
              {consentFeature?.description}
            </DialogDescription>
            <div className="space-y-2 text-sm">
              <p>
                <strong>Provider:</strong> {consentFeature?.provider}
              </p>
              <p>
                <strong>Purpose:</strong> {consentFeature?.purpose}
              </p>
              <div className="rounded-lg border p-3 space-y-2">
                <div>
                  <Badge variant="secondary" className="mb-1">Limited mode (default)</Badge>
                  <p className="text-xs text-muted-foreground">{consentFeature?.redactedData}</p>
                </div>
                <Separator />
                <div>
                  <Badge className="mb-1">Full access</Badge>
                  <p className="text-xs text-muted-foreground">{consentFeature?.fullData}</p>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={handleConsentDeny}>Not now</Button>
            {consentDialog !== "literacy" && (
              <Button variant="outline" onClick={handleConsentRedacted}>Use limited mode</Button>
            )}
            <Button onClick={handleConsentFull}>Grant full access</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showConsentSettings} onOpenChange={setShowConsentSettings}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Data Sharing Settings
            </DialogTitle>
            <DialogDescription>
              Each AI feature can send data to Google Gemini (free tier). You control how much.
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
                      {level === "FullGranted" ? "Full access" : level === "NotPrompted" ? "Not prompted" : "Limited"}
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
                      Full
                    </Button>
                    <Button
                      size="sm"
                      variant={level === "Redacted" ? "default" : "outline"}
                      onClick={() => {
                        revokeConsent(fid);
                      }}
                    >
                      Limited
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <Button onClick={() => setShowConsentSettings(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
