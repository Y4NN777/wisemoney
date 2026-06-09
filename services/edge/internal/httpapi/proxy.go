package httpapi

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"

	"github.com/y4nn/wisemoney/services/edge/internal/consent"
	"github.com/y4nn/wisemoney/services/edge/internal/egress"
	"github.com/y4nn/wisemoney/services/edge/internal/middleware"
	"github.com/y4nn/wisemoney/services/edge/internal/provider"
)

// ProxyRequest is the body the client sends to /v1/ai/proxy.
// X-Egress-Level header must be "redacted" or "full" (INV-EGR-03 managed clause).
// For "full" requests, X-Consent-Assertion must carry a valid server-signed assertion
// and X-Feature must name the requesting feature (AQ-01 resolution, ARCHITECTURE §10a).
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

// newProxyHandler returns the handler for POST /v1/ai/proxy.
// consentSvc gates full-egress: an HMAC-signed assertion must be present and valid
// or the request is forced to "redacted" (fail-closed, INV-EGR-03a, ARCHITECTURE §10a).
func newProxyHandler(router *provider.Router, validator *egress.Validator, consentSvc *consent.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// UserID is extracted from the validated JWT by JWTAuth middleware (INV-AUTH-01).
		// All routing decisions use JWT sub only — no client-supplied user ID trusted
		// (INV-AUTH-04, M-AUTH-06).
		userID := middleware.UserIDFromContext(r.Context())
		if userID == "" {
			http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
			return
		}

		// -- Egress-level gate (INV-EGR-03a, ARCHITECTURE §10a) ----------------
		// Default to "redacted" (fail-safe). Only promote to "full" when ALL of:
		//   1. Client requested "full" via X-Egress-Level.
		//   2. X-Feature header is present and non-empty.
		//   3. X-Consent-Assertion header is present, decodes cleanly, and passes
		//      consentSvc.Verify (HMAC valid, not expired, user_id == JWT sub,
		//      feature == X-Feature, level == "full").
		// Any failure forces "redacted" — never outright reject; the structural cap
		// (validator.Validate) decides whether the payload then passes as redacted.
		requestedLevel := r.Header.Get("X-Egress-Level")
		effectiveLevel := "redacted"

		if requestedLevel == "full" {
			featureHeader := r.Header.Get("X-Feature")
			assertionHeader := r.Header.Get("X-Consent-Assertion")

			switch {
			case featureHeader == "":
				log.Printf("egress-gate: forced redacted; userID=%s feature=<missing> reason=missing X-Feature header", userID)

			case assertionHeader == "":
				log.Printf("egress-gate: forced redacted; userID=%s feature=%s reason=missing X-Consent-Assertion header", userID, featureHeader)

			default:
				var assertion consent.ConsentAssertion
				if err := json.Unmarshal([]byte(assertionHeader), &assertion); err != nil {
					log.Printf("egress-gate: forced redacted; userID=%s feature=%s reason=assertion decode error", userID, featureHeader)
				} else if err := consentSvc.Verify(userID, featureHeader, &assertion); err != nil {
					log.Printf("egress-gate: forced redacted; userID=%s feature=%s reason=%s", userID, featureHeader, err.Error())
				} else {
					effectiveLevel = "full"
				}
			}
		}

		// -- Request body -------------------------------------------------------
		var req ProxyRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			// Distinguish body-too-large (MED-01 cap) from malformed JSON.
			var maxErr *http.MaxBytesError
			if errors.As(err, &maxErr) {
				http.Error(w, `{"error":"payload_too_large","message":"request body exceeds limit"}`, http.StatusRequestEntityTooLarge)
				return
			}
			http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
			return
		}

		// -- Structural payload cap (AQ-01, INV-EGR-03a) -----------------------
		// Validate against the effective (possibly downgraded) egress level.
		// A forced-redacted request carrying full-only fields is rejected 400.
		if err := validator.Validate(effectiveLevel, req.Payload); err != nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}

		// -- Provider dispatch --------------------------------------------------
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
