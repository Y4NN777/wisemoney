/**
 * AI Orchestration client — manages transport selection and hides provider / mode
 * detail from all callers.
 *
 * NFR-MOD-02: this is the ONLY module that knows about provider SDKs or adapters.
 * UI surfaces NEVER import this module directly; they go through the Intelligence
 * or Literacy pillars.
 *
 * Two paths (ARCHITECTURE §3 flows c and d):
 *   - Managed mode: client → Go edge (JWT, redacted aggregates only) → provider
 *   - BYO-key mode: client → provider directly (INV-AUTH-05)
 *
 * INV-PROXY-04: if all providers fail, return a ProviderUnavailableSignal — never
 * fabricate a response.
 *
 * INV-KEY-02 (BYO-key): decryptBYOKey is called in-memory; the key is passed to
 * the provider only for the direct request. Never sent to the edge or logged.
 */

import type { EgressContext } from "@/consent/redaction.ts";
import { toRedacted } from "@/consent/redaction.ts";
import { getAccessToken, refresh } from "@/auth/session.ts";
import { postAiProxy, EdgeAuthError } from "@/api/edgeClient.ts";
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

export const MAX_AI_PROMPT_LENGTH = 4000;
const DIRECT_PROVIDER_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Submit a shaped egress context to the appropriate AI transport.
 *
 * Two paths (selected via `mode`):
 *
 * MANAGED MODE:
 * 1. Reduce the context to redacted aggregates. Managed full egress is disabled.
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
    { provider: "gemini", model: "gemini-3.6-flash", baseURL: "https://generativelanguage.googleapis.com" },
    { provider: "openai", model: "gpt-4o", baseURL: "https://api.openai.com" },
    { provider: "openrouter", model: "openai/gpt-4o", baseURL: "https://openrouter.ai/api" },
    { provider: "deepseek", model: "deepseek-v4-flash", baseURL: "https://api.deepseek.com" },
  ],
  classification: [
    { provider: "deepseek", model: "deepseek-v4-flash", baseURL: "https://api.deepseek.com" },
    { provider: "gemini", model: "gemini-3.6-flash", baseURL: "https://generativelanguage.googleapis.com" },
    { provider: "openrouter", model: "openai/gpt-4o-mini", baseURL: "https://openrouter.ai/api" },
    { provider: "openai", model: "gpt-4o-mini", baseURL: "https://api.openai.com" },
  ],
  teaching: [
    { provider: "openai", model: "gpt-4o", baseURL: "https://api.openai.com" },
    { provider: "gemini", model: "gemini-3.6-flash", baseURL: "https://generativelanguage.googleapis.com" },
    { provider: "openrouter", model: "openai/gpt-4o", baseURL: "https://openrouter.ai/api" },
    { provider: "deepseek", model: "deepseek-v4-flash", baseURL: "https://api.deepseek.com" },
  ],
  summarization: [
    { provider: "gemini", model: "gemini-3.6-flash", baseURL: "https://generativelanguage.googleapis.com" },
    { provider: "openai", model: "gpt-4o-mini", baseURL: "https://api.openai.com" },
    { provider: "openrouter", model: "openai/gpt-4o-mini", baseURL: "https://openrouter.ai/api" },
    { provider: "deepseek", model: "deepseek-v4-flash", baseURL: "https://api.deepseek.com" },
  ],
};

async function callProviderDirect(
  route: ProviderRoute,
  apiKey: string,
  payload: EgressContext,
  taskType: string,
  featureId: string,
  prompt?: string
): Promise<AIResult> {
  let url: string;
  let body: unknown;

  switch (route.provider) {
    case "gemini": {
      url = `${route.baseURL}/v1beta/models/${route.model}:generateContent`;
      body = {
        contents: [{ parts: [{ text: providerInput(payload, prompt) }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
      };
      break;
    }
    case "openai":
    case "openrouter":
    case "deepseek": {
      url = `${route.baseURL}/v1/chat/completions`;
      body = {
        model: route.model,
        messages: [
          { role: "system", content: "You are a helpful financial assistant." },
          { role: "user", content: providerInput(payload, prompt) },
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
    signal: AbortSignal.timeout(DIRECT_PROVIDER_TIMEOUT_MS),
  });

  if (!resp.ok) {
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

  if (text.trim() === "") {
    throw new Error(`${route.provider} returned an empty response`);
  }

  return { text, featureId, taskType: taskType as TaskType, provider: route.provider };
}

function providerInput(payload: EgressContext, prompt?: string): string {
  return JSON.stringify(prompt == null || prompt.trim() === ""
    ? { context: payload }
    : { context: payload, prompt: prompt.trim() });
}

export async function submit(
  egressContext: EgressContext,
  taskType: TaskType,
  mode: AIMode,
  featureId: string,
  masterKey: MasterKey,
  prompt?: string
): Promise<AIResult> {
  const normalizedPrompt = prompt?.trim();
  if (normalizedPrompt != null && normalizedPrompt.length > MAX_AI_PROMPT_LENGTH) {
    throw new Error(`AI prompt exceeds ${MAX_AI_PROMPT_LENGTH} characters`);
  }
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
        const result = await callProviderDirect(route, apiKey, egressContext, taskType, featureId, normalizedPrompt);
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

  // Managed MVP is aggregate-only regardless of local consent state. Full
  // egress remains available only through the user-funded BYO path (ADR-0011).
  const effectivePayload = toRedacted(egressContext);

  const callProxy = async (token: string): Promise<AIResult> => {
    try {
      // exactOptionalPropertyTypes: build the args object without the optional
      // key when there is no assertion, so `undefined` is not assigned to an
      // optional property (TS2379).
      const proxyArgs = {
        accessToken: token,
        feature: featureId,
        taskType,
        payload: effectivePayload,
        ...(normalizedPrompt == null || normalizedPrompt === "" ? {} : { prompt: normalizedPrompt }),
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
      await refresh(masterKey);
      const freshToken = await getAccessToken(masterKey);
      // Second attempt: if this 401s again the error propagates to the caller —
      // no further retry to prevent loops (RFC 6749 §6; ADR-0012 M-AUTH-05).
      return await callProxy(freshToken);
    }
    throw err;
  }
}
