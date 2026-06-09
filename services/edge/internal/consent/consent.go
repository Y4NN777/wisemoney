// Package consent implements the server-signed consent assertion mechanism
// (AQ-01 resolution, THREAT_MODEL §3 Option B + C).
//
// When a client wants to make a full-egress AI request, it must first obtain a
// short-lived consent assertion from this endpoint, having granted per-feature
// explicit consent in the UI (INV-EGR-02). The edge issues an HMAC-signed
// assertion; the proxy handler validates it before forwarding a full-egress
// payload (INV-EGR-03a).
//
// The assertion is NOT the enforcement mechanism on its own — the egress package
// (structural payload cap) is the primary gate. The assertion proves consent was
// granted via a server round-trip, not just a localStorage flag (T-EGR-01).
//
// Assertion lifecycle:
//   - Issued at: /v1/consent/assert (authenticated; user must present a valid JWT).
//   - Short-lived: TTL defined by consentAssertionTTL (recommend: 5 min or less).
//   - Single-use: TODO — track nonce in-memory to prevent replay within TTL window.
//   - Bound to: user ID + feature + egress level.
package consent

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/y4nn/wisemoney/services/edge/internal/middleware"
)

// defaultConsentAssertionTTL applies if NewService is given a zero TTL.
// Must be short: the assertion proves consent at a point in time, not a
// standing permission (AQ-01, ARCHITECTURE §10a "Consent-assertion contract",
// THREAT_MODEL §3).
const defaultConsentAssertionTTL = 5 * time.Minute

// ConsentAssertion is the server-signed payload carried by the client in the
// X-Consent-Assertion header when making a full-egress AI request.
type ConsentAssertion struct {
	UserID    string `json:"user_id"`
	Feature   string `json:"feature"`
	Level     string `json:"level"`  // "full"
	IssuedAt  int64  `json:"iat"`
	ExpiresAt int64  `json:"exp"`
	Nonce     string `json:"nonce"`  // prevents replay within TTL
	Signature string `json:"sig"`    // HMAC-SHA256 of (user_id|feature|level|iat|exp|nonce)
}

// Service issues and verifies consent assertions.
type Service struct {
	signingKey []byte
	ttl        time.Duration
}

// NewService constructs a consent Service.
//
// consentSigningKey is the DEDICATED consent-assertion HMAC key
// (CONSENT_SIGNING_KEY) — separate from the JWT signing key so consent and auth
// keys rotate independently (Gate-5; ARCHITECTURE §10a). ttl is the assertion
// lifetime (CONSENT_ASSERTION_TTL, ~5m); a zero value falls back to the default.
func NewService(consentSigningKey string, ttl time.Duration) *Service {
	if ttl <= 0 {
		ttl = defaultConsentAssertionTTL
	}
	return &Service{signingKey: []byte(consentSigningKey), ttl: ttl}
}

// HandleAssert handles POST /v1/consent/assert.
// The client sends the feature name; the edge issues a signed assertion.
// The user must be authenticated (JWTAuth middleware runs before this handler).
func (s *Service) HandleAssert(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	if userID == "" {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var body struct {
		Feature string `json:"feature"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		// Distinguish body-too-large (MED-01 cap) from malformed JSON.
		var maxErr *http.MaxBytesError
		if errors.As(err, &maxErr) {
			http.Error(w, `{"error":"payload_too_large","message":"request body exceeds limit"}`, http.StatusRequestEntityTooLarge)
			return
		}
		http.Error(w, `{"error":"invalid_request","message":"feature is required"}`, http.StatusBadRequest)
		return
	}
	if body.Feature == "" {
		http.Error(w, `{"error":"invalid_request","message":"feature is required"}`, http.StatusBadRequest)
		return
	}

	assertion, err := s.issue(userID, body.Feature)
	if err != nil {
		http.Error(w, `{"error":"internal_error"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(assertion)
}

// Verify validates a consent assertion presented in an AI proxy request.
// Returns an error if the assertion is invalid, expired, or tampered.
// Called by the egress validator before forwarding full-egress requests (INV-EGR-03a).
func (s *Service) Verify(userID, feature string, assertion *ConsentAssertion) error {
	now := time.Now().Unix()

	if assertion.UserID != userID {
		return fmt.Errorf("consent: user_id mismatch")
	}
	if assertion.Feature != feature {
		return fmt.Errorf("consent: feature mismatch")
	}
	if assertion.Level != "full" {
		return fmt.Errorf("consent: level must be full")
	}
	if now > assertion.ExpiresAt {
		return fmt.Errorf("consent: assertion expired")
	}

	expected := s.sign(assertion)
	if !hmac.Equal([]byte(expected), []byte(assertion.Signature)) {
		return fmt.Errorf("consent: invalid signature")
	}

	// TODO(impl): check nonce has not been used within the TTL window (replay prevention).
	// Track issued nonces in an in-memory set with TTL cleanup.

	return nil
}

// -- internal helpers ---------------------------------------------------------

func (s *Service) issue(userID, feature string) (*ConsentAssertion, error) {
	now := time.Now().UTC()
	nonce, err := randomNonce()
	if err != nil {
		return nil, fmt.Errorf("consent: generating nonce: %w", err)
	}

	a := &ConsentAssertion{
		UserID:    userID,
		Feature:   feature,
		Level:     "full",
		IssuedAt:  now.Unix(),
		ExpiresAt: now.Add(s.ttl).Unix(),
		Nonce:     nonce,
	}
	a.Signature = s.sign(a)
	return a, nil
}

func (s *Service) sign(a *ConsentAssertion) string {
	msg := fmt.Sprintf("%s|%s|%s|%d|%d|%s",
		a.UserID, a.Feature, a.Level, a.IssuedAt, a.ExpiresAt, a.Nonce)
	mac := hmac.New(sha256.New, s.signingKey)
	mac.Write([]byte(msg))
	return hex.EncodeToString(mac.Sum(nil))
}

func randomNonce() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}
