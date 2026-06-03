package httpapi

import (
	"encoding/json"
	"net/http"

	"github.com/y4nn/wisemoney/services/edge/internal/egress"
	"github.com/y4nn/wisemoney/services/edge/internal/middleware"
	"github.com/y4nn/wisemoney/services/edge/internal/provider"
)

// ProxyRequest is the body the client sends to /v1/ai/proxy.
// X-Egress-Level header must be "redacted" or "full" (INV-EGR-03 managed clause).
// For "full" requests, X-Consent-Assertion must carry a valid server-signed assertion
// (AQ-01 resolution, THREAT_MODEL §3).
type ProxyRequest struct {
	// TaskType is one of: "reasoning", "classification", "teaching", "summarization"
	// (FR-AIORCH-03, ARCHITECTURE §9).
	TaskType string `json:"task_type"`

	// Payload is the AI context assembled by the client's AI Context Builder.
	// Shape is validated against the egress schema before forwarding (INV-EGR-03a).
	Payload json.RawMessage `json:"payload"`
}

// ProxyResponse wraps the normalized AI provider response (INV-PROXY-03).
type ProxyResponse struct {
	// Content is the normalized, provider-agnostic response text.
	Content string `json:"content"`

	// Provider records which provider served the request (informational only;
	// never logged with payload — INV-PROXY-02).
	Provider string `json:"provider"`
}

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

		egressLevel := r.Header.Get("X-Egress-Level")
		if egressLevel == "" {
			egressLevel = "redacted" // fail-safe default (THREAT_MODEL §3 step 3)
		}

		var req ProxyRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
			return
		}

		// Egress enforcement: structural payload cap (AQ-01 resolution, INV-EGR-03a).
		// For "full" egress the consent assertion must also be validated (consent package).
		// TODO(impl): call validator.Validate(egressLevel, req.Payload, consentAssertion)
		// and return 400 on violation before forwarding to the provider.
		_ = validator
		_ = egressLevel

		// TODO(FR-AIORCH-03, FR-AIORCH-05): route to the appropriate provider adapter
		// using req.TaskType and the operator routing config; apply cross-provider fallback.
		resp, err := router.Dispatch(r.Context(), userID, req.TaskType, req.Payload)
		if err != nil {
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
