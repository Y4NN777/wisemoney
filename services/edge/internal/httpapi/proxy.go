package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"unicode/utf8"

	"github.com/y4nn/wisemoney/services/edge/internal/egress"
	"github.com/y4nn/wisemoney/services/edge/internal/httpjson"
	"github.com/y4nn/wisemoney/services/edge/internal/middleware"
	"github.com/y4nn/wisemoney/services/edge/internal/provider"
)

// ProxyRequest is the body the client sends to /v1/ai/proxy.
// Managed requests are always validated against the redacted schema.
type ProxyRequest struct {
	// TaskType is one of: "reasoning", "classification", "teaching", "summarization"
	// (FR-AIORCH-03, ARCHITECTURE §9).
	TaskType string `json:"task_type"`

	// Payload is the AI context assembled by the client's AI Context Builder.
	// Shape is validated against the egress schema before forwarding (INV-EGR-03a).
	Payload json.RawMessage `json:"payload"`

	// Prompt is user-authored instruction text, separate from financial context.
	Prompt string `json:"prompt,omitempty"`
}

const maxPromptRunes = 4000

type providerInput struct {
	Context json.RawMessage `json:"context"`
	Prompt  string          `json:"prompt,omitempty"`
}

// ProxyResponse wraps the normalized AI provider response (INV-PROXY-03).
type ProxyResponse struct {
	// Content is the normalized, provider-agnostic response text.
	Content string `json:"content"`

	// Provider records which provider served the request (informational only;
	// never logged with payload — INV-PROXY-02).
	Provider string `json:"provider"`
}

// newProxyHandler returns the handler for POST /v1/ai/proxy.
func newProxyHandler(router *provider.Router, validator *egress.Validator) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// UserID is extracted from the validated JWT by JWTAuth middleware (INV-AUTH-01).
		// All routing decisions use JWT sub only — no client-supplied user ID trusted
		// (INV-AUTH-04, M-AUTH-06).
		userID := middleware.UserIDFromContext(r.Context())
		if userID == "" {
			http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
			return
		}

		// -- Request body -------------------------------------------------------
		var req ProxyRequest
		if err := httpjson.DecodeObject(r.Body, &req); err != nil {
			// Distinguish body-too-large (MED-01 cap) from malformed JSON.
			var maxErr *http.MaxBytesError
			if errors.As(err, &maxErr) {
				http.Error(w, `{"error":"payload_too_large","message":"request body exceeds limit"}`, http.StatusRequestEntityTooLarge)
				return
			}
			http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
			return
		}
		if !provider.IsSupportedTaskType(req.TaskType) {
			http.Error(w, `{"error":"invalid_task_type","message":"unsupported task type"}`, http.StatusBadRequest)
			return
		}

		// -- Structural payload cap (AQ-01, INV-EGR-03a) -----------------------
		// Validate against the effective (possibly downgraded) egress level.
		// A forced-redacted request carrying full-only fields is rejected 400.
		if err := validator.Validate(req.Payload); err != nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}
		req.Prompt = strings.TrimSpace(req.Prompt)
		if !utf8.ValidString(req.Prompt) || utf8.RuneCountInString(req.Prompt) > maxPromptRunes {
			http.Error(w, `{"error":"invalid_prompt","message":"prompt must contain at most 4000 characters"}`, http.StatusBadRequest)
			return
		}
		providerPayload, err := json.Marshal(providerInput{Context: req.Payload, Prompt: req.Prompt})
		if err != nil {
			http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
			return
		}

		// -- Provider dispatch --------------------------------------------------
		resp, err := router.Dispatch(r.Context(), userID, req.TaskType, providerPayload)
		if err != nil {
			if errors.Is(err, provider.ErrUnknownTaskType) {
				http.Error(w, `{"error":"invalid_task_type","message":"unsupported task type"}`, http.StatusBadRequest)
				return
			}
			// Graceful degradation: AI unavailable must not affect Financial State (INV-PROXY-04).
			http.Error(w, `{"error":"ai_unavailable","message":"AI providers are currently unavailable. Your financial data is unaffected."}`, http.StatusServiceUnavailable)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(ProxyResponse{
			Content:  resp.Content,
			Provider: resp.Provider,
		})
	}
}
