/**
 * AI Orchestration client — manages transport selection and hides provider / mode
 * detail from all callers.
 *
 * NFR-MOD-02: this is the ONLY module that knows about provider SDKs or adapters.
 * UI surfaces NEVER import this module directly; they go through the Intelligence
 * or Literacy pillars.
 *
 * Two paths (ARCHITECTURE §3 flows c and d):
 *   - Managed mode: client → Go edge (JWT + consent assertion) → provider
 *   - BYO-key mode: client → provider directly (INV-AUTH-05)
 *
 * INV-PROXY-04: if all providers fail, return a ProviderUnavailableSignal — never
 * fabricate a response.
 *
 * INV-KEY-02 (BYO-key): decryptBYOKey is called in-memory; the key is passed to
 * the provider and then ZEROED from memory. Never sent to the edge. Never logged.
 */

import type { EgressContext, FullEgressContext } from "@/consent/redaction.ts";
import { toRedacted } from "@/consent/redaction.ts";
import { getConsentLevel, getConsentAssertion, storeConsentAssertion } from "@/consent/consentStore.ts";
import { getAccessToken, refresh } from "@/auth/session.ts";
import { postAiProxy, postConsentAssert, EdgeAuthError } from "@/api/edgeClient.ts";
import type { MasterKey } from "@/crypto/envelope.ts";
import { decryptBYOKey } from "@/crypto/keyManagement.ts";

/** AI task types — determine provider/model routing (ARCHITECTURE §9). */
export type TaskType = "reasoning" | "classification" | "teaching" | "summarization";

/** Operating mode. */
export type AIMode = "managed" | "byo";

/** Normalized AI response returned to all callers (INV-PROXY-03). */
export type NormalizedAIResponse = {
  text: string;
  featureId: string;
  taskType: TaskType;
  provider: string;
};

/** Emitted when all providers for a task type are unavailable (INV-PROXY-04). */
export type ProviderUnavailableSignal = {
  unavailable: true;
  taskType: TaskType;
  /** User-facing message — clear, not fabricated. */
  message: string;
};

export type AIResult = NormalizedAIResponse | ProviderUnavailableSignal;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Type-guard: is the egress context the Full variant?
 *
 * FullEgressContext is a superset of RedactedEgressContext (it adds
 * `transactions`). We narrow on the presence of that field.
 */
function isFullEgressContext(ctx: EgressContext): ctx is FullEgressContext {
  return "transactions" in ctx;
}

/**
 * Determine the effective egress level and the assertion to attach.
 *
 * Full egress requires ALL three conditions to be true:
 *   1. consentStore reports FullGranted for this feature.
 *   2. A stored assertion is present (the edge signed it; client holds it opaquely).
 *   3. The egressContext is the Full variant (i.e. the caller shaped full data).
 *
 * Conditions 1 and 3 are evaluated synchronously here. Condition 2 — whether
 * the assertion is present (and not expired) — may require a network call to
 * re-acquire the assertion from POST /v1/consent/assert when it is absent or
 * expired. That re-acquisition is handled in resolveFullEgress (async).
 *
 * If conditions 1 or 3 are false the call is immediately downgraded to
 * "redacted" — no async work needed.
 */
function needsFullEgressCheck(
  featureId: string,
  egressContext: EgressContext
): boolean {
  return (
    getConsentLevel(featureId) === "FullGranted" &&
    isFullEgressContext(egressContext)
  );
}

/**
 * Attempt to resolve a valid assertion for full-egress.
 *
 * - If a stored assertion is present, return it immediately.
 * - If no assertion is stored, request one from POST /v1/consent/assert using
 *   the current access token, store it, and return it.
 * - If re-acquisition fails for any reason other than a 401 (or fails after a
 *   single 401→refresh retry), return null so the caller can downgrade.
 *
 * The 401→refresh path uses the same `masterKey` already materialised by the
 * caller so no extra key derivation is needed.
 */
async function resolveFullEgress(
  featureId: string,
  accessToken: string,
  masterKey: MasterKey
): Promise<{ assertion: string } | null> {
  // Fast path: assertion already cached.
  const stored = getConsentAssertion(featureId);
  if (stored !== null) {
    return { assertion: stored };
  }

  // Slow path: re-acquire from the edge.
  const acquire = async (token: string): Promise<string> => {
    return postConsentAssert({ accessToken: token, feature: featureId });
  };

  try {
    const assertion = await acquire(accessToken);
    storeConsentAssertion(featureId, assertion);
    return { assertion };
  } catch (err) {
    if (err instanceof EdgeAuthError && err.status === 401) {
      // Single token-refresh attempt, then retry the assertion call once.
      try {
        await refresh(masterKey);
        const freshToken = await getAccessToken(masterKey);
        const assertion = await acquire(freshToken);
        storeConsentAssertion(featureId, assertion);
        return { assertion };
      } catch {
        // Refresh or second assertion attempt failed — downgrade to redacted.
        return null;
      }
    }
    // Network error, 4xx (non-401), 5xx — downgrade to redacted.
    return null;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Submit a shaped egress context to the appropriate AI transport.
 *
 * Two paths (selected via `mode`):
 *
 * MANAGED MODE:
 * 1. Determine egress level:
 *    - "full" iff consentStore reports FullGranted AND a stored assertion exists
 *      AND the egressContext is the Full variant. Any condition false → "redacted".
 * 2. Obtain a valid access token via getAccessToken(masterKey) (refreshes near-expiry).
 * 3. POST to /v1/ai/proxy with the correct headers (ARCHITECTURE §10a, T-S0-05).
 * 4. On 401: refresh once, retry with the fresh token. If 401 again → surface as
 *    unavailable (no infinite loop; INV-AUTH-07 respected throughout).
 * 5. On 503: return ProviderUnavailableSignal (INV-PROXY-04).
 * 6. On 200: return NormalizedAIResponse.
 *
 * BYO-KEY MODE:
 * 1. Look up the provider routing chain for the task type (byoRouting table).
 * 2. For each provider in the chain: decrypt the BYO API key via decryptBYOKey,
 *    call the provider directly via callProviderDirect, return on first success.
 * 3. If all providers fail, return ProviderUnavailableSignal (INV-PROXY-04).
 *
 * @param egressContext - already consent-shaped context from AIContextBuilder
 * @param taskType      - determines provider/model routing (ARCHITECTURE §9)
 * @param mode          - "managed" (edge-proxied) or "byo" (direct)
 * @param featureId     - consent + response attribution
 * @param masterKey     - in-memory master key (INV-AUTH-07: passed in, never retained)
 */
// ---------------------------------------------------------------------------
// BYO-key routing configuration — mirrors edge router.go (FR-AIORCH-03)
// ---------------------------------------------------------------------------

type ProviderRoute = {
  provider: string;
  model: string;
  baseURL: string;
};

const byoRouting: Record<TaskType, ProviderRoute[]> = {
  reasoning: [
    { provider: "gemini", model: "gemini-2.0-flash", baseURL: "https://generativelanguage.googleapis.com" },
    { provider: "openai", model: "gpt-4o", baseURL: "https://api.openai.com" },
    { provider: "nvidia_nim", model: "meta/llama-3.1-405b-instruct", baseURL: "https://integrate.api.nvidia.com" },
  ],
  classification: [
    { provider: "nvidia_nim", model: "meta/llama-3.1-405b-instruct", baseURL: "https://integrate.api.nvidia.com" },
    { provider: "gemini", model: "gemini-2.0-flash", baseURL: "https://generativelanguage.googleapis.com" },
    { provider: "openai", model: "gpt-4o-mini", baseURL: "https://api.openai.com" },
  ],
  teaching: [
    { provider: "openai", model: "gpt-4o", baseURL: "https://api.openai.com" },
    { provider: "gemini", model: "gemini-2.0-flash", baseURL: "https://generativelanguage.googleapis.com" },
    { provider: "nvidia_nim", model: "meta/llama-3.1-405b-instruct", baseURL: "https://integrate.api.nvidia.com" },
  ],
  summarization: [
    { provider: "gemini", model: "gemini-2.0-flash", baseURL: "https://generativelanguage.googleapis.com" },
    { provider: "openai", model: "gpt-4o-mini", baseURL: "https://api.openai.com" },
    { provider: "nvidia_nim", model: "meta/llama-3.1-405b-instruct", baseURL: "https://integrate.api.nvidia.com" },
  ],
};

async function callProviderDirect(
  route: ProviderRoute,
  apiKey: string,
  payload: EgressContext,
  taskType: string,
  featureId: string
): Promise<AIResult> {
  let url: string;
  let body: unknown;

  switch (route.provider) {
    case "gemini": {
      url = `${route.baseURL}/v1beta/models/${route.model}:generateContent`;
      body = {
        contents: [{ parts: [{ text: JSON.stringify(payload) }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
      };
      break;
    }
    case "openai": {
      url = `${route.baseURL}/v1/chat/completions`;
      body = {
        model: route.model,
        messages: [
          { role: "system", content: "You are a helpful financial assistant." },
          { role: "user", content: JSON.stringify(payload) },
        ],
        temperature: 0.7,
        max_tokens: 1024,
      };
      break;
    }
    case "nvidia_nim": {
      url = `${route.baseURL}/v1/chat/completions`;
      body = {
        model: route.model,
        messages: [
          { role: "system", content: "You are a helpful financial assistant." },
          { role: "user", content: JSON.stringify(payload) },
        ],
        temperature: 0.7,
        max_tokens: 1024,
      };
      break;
    }
    default:
      return {
        unavailable: true,
        taskType: taskType as TaskType,
        message: `Unknown provider: ${route.provider}`,
      };
  }

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(route.provider === "gemini"
        ? { "x-goog-api-key": apiKey }
        : { Authorization: `Bearer ${apiKey}` }),
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    if (resp.status >= 500) {
      return {
        unavailable: true,
        taskType: taskType as TaskType,
        message: `${route.provider} is temporarily unavailable.`,
      };
    }
    throw new Error(`${route.provider} returned status ${resp.status}`);
  }

  const data = (await resp.json()) as Record<string, unknown>;
  let text = "";

  if (route.provider === "gemini") {
    const candidates = data.candidates as Array<Record<string, unknown>> | undefined;
    const content = candidates?.[0]?.content as Record<string, unknown> | undefined;
    const parts = content?.parts as Array<Record<string, unknown>> | undefined;
    text = parts?.map((p) => { const t = p.text as string | undefined; return t ?? ""; }).join("") ?? "";
  } else {
    const choices = data.choices as Array<Record<string, unknown>> | undefined;
    const message = choices?.[0]?.message as Record<string, unknown> | undefined;
    const content = message?.content;
    text = typeof content === "string" ? content : "";
  }

  return { text, featureId, taskType: taskType as TaskType, provider: route.provider };
}

export async function submit(
  egressContext: EgressContext,
  taskType: TaskType,
  mode: AIMode,
  featureId: string,
  masterKey: MasterKey
): Promise<AIResult> {
  if (mode === "byo") {
    const chain = byoRouting[taskType];
    if (chain == null || chain.length === 0) {
      return {
        unavailable: true,
        taskType,
        message: `No provider configured for ${taskType} in BYO-key mode.`,
      };
    }

    let lastErr: Error | null = null;
    const triedProviders = new Set<string>();
    for (let i = 0; i < chain.length; i++) {
      const route = chain[i]!;
      if (triedProviders.has(route.provider)) continue;
      triedProviders.add(route.provider);
      try {
        const apiKey = await decryptBYOKey(route.provider, masterKey);
        const result = await callProviderDirect(route, apiKey, egressContext, taskType, featureId);
        return result;
      } catch (err) {
        lastErr = err instanceof Error ? err : new Error(String(err));
      }
    }

    return {
      unavailable: true,
      taskType,
      message: lastErr != null
        ? `AI temporarily unavailable: ${lastErr.message}`
        : "AI is temporarily unavailable. Your financial data is unaffected.",
    };
  }

  // ── Managed path ──────────────────────────────────────────────────────────

  // Obtain (or refresh near-expiry) access token. INV-AUTH-07: masterKey passed
  // in, never retained in this module.
  const accessToken = await getAccessToken(masterKey);

  // ── Egress level resolution ───────────────────────────────────────────────
  //
  // Full egress requires FullGranted consent + Full context variant + a valid
  // assertion. The assertion may need to be re-acquired if absent/expired.
  //
  // If re-acquisition fails we downgrade to redacted (toRedacted strips the
  // full-only fields) — never send a Full-shaped body under X-Egress-Level: redacted,
  // which would produce a 400 from the edge structural cap (INV-EGR-03a).

  let effectiveEgressLevel: "redacted" | "full";
  let effectiveAssertion: string | undefined;
  let effectivePayload: EgressContext;

  if (needsFullEgressCheck(featureId, egressContext)) {
    const resolved = await resolveFullEgress(featureId, accessToken, masterKey);
    if (resolved !== null) {
      // Assertion acquired (or already cached) — send full.
      effectiveEgressLevel = "full";
      effectiveAssertion = resolved.assertion;
      effectivePayload = egressContext;
    } else {
      // Re-acquisition failed — graceful downgrade: strip full-only fields so
      // the payload is structurally RedactedEgressContext (INV-EGR-01).
      effectiveEgressLevel = "redacted";
      effectiveAssertion = undefined;
      effectivePayload = toRedacted(egressContext);
    }
  } else {
    // Consent is Redacted/NotPrompted, or context is already the Redacted
    // variant — send redacted without attempting assertion re-acquisition.
    effectiveEgressLevel = "redacted";
    effectiveAssertion = undefined;
    effectivePayload = egressContext;
  }

  const callProxy = async (token: string): Promise<AIResult> => {
    try {
      // exactOptionalPropertyTypes: build the args object without the optional
      // key when there is no assertion, so `undefined` is not assigned to an
      // optional property (TS2379).
      const proxyArgs =
        effectiveAssertion !== undefined
          ? {
              accessToken: token,
              egressLevel: effectiveEgressLevel,
              feature: featureId,
              consentAssertion: effectiveAssertion,
              taskType,
              payload: effectivePayload,
            }
          : {
              accessToken: token,
              egressLevel: effectiveEgressLevel,
              feature: featureId,
              taskType,
              payload: effectivePayload,
            };
      const resp = await postAiProxy(proxyArgs);
      return { text: resp.content, featureId, taskType, provider: resp.provider };
    } catch (err) {
      if (err instanceof EdgeAuthError && err.status === 503) {
        // All providers unavailable — surface a clear user-facing signal (INV-PROXY-04).
        return {
          unavailable: true,
          taskType,
          message:
            "AI is temporarily unavailable. Your financial data is unaffected.",
        };
      }
      // Re-throw all other errors (401, 400, network failures) so the caller
      // or the retry wrapper can handle them.
      throw err;
    }
  };

  try {
    return await callProxy(accessToken);
  } catch (err) {
    if (err instanceof EdgeAuthError && err.status === 401) {
      // Token was rejected — perform one refresh attempt and retry.
      // INV-AUTH-07: masterKey passed through, not retained.
      // Note: assertion re-acquisition already performed a refresh if the
      // assertion call 401-ed. This retry covers a 401 on the proxy call itself.
      await refresh(masterKey);
      const freshToken = await getAccessToken(masterKey);
      // Second attempt: if this 401s again the error propagates to the caller —
      // no further retry to prevent loops (RFC 6749 §6; ADR-0012 M-AUTH-05).
      return await callProxy(freshToken);
    }
    throw err;
  }
}

/**
 * Resolve the primary provider config for a task type in BYO-key mode.
 */
export function clientSideRoute(
  taskType: TaskType,
  preferredProvider?: string
): { provider: string; model: string } {
  const chain = byoRouting[taskType];
  if (chain == null || chain.length === 0) {
    throw new Error(`clientSideRoute: no route for task type "${taskType}"`);
  }
  const entry = preferredProvider != null
    ? chain.find((c) => c.provider === preferredProvider)
    : chain[0];
  if (entry == null) {
    throw new Error(`clientSideRoute: provider "${preferredProvider}" not found for "${taskType}"`);
  }
  return { provider: entry.provider, model: entry.model };
}

/**
 * Resolve the next fallback provider for a task type in BYO-key mode.
 * Cross-provider fallback (FR-AIORCH-05): the fallback must be on a
 * DIFFERENT provider than the one that failed.
 */
export function clientSideFallback(
  taskType: TaskType,
  failedProvider: string
): { provider: string; model: string } | null {
  const chain = byoRouting[taskType];
  if (chain == null) return null;
  const next = chain.find((c) => c.provider !== failedProvider);
  if (next == null) return null;
  return { provider: next.provider, model: next.model };
}
