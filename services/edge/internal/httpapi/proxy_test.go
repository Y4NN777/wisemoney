package httpapi

// proxy_test.go: table-driven gate tests for the full-egress consent check wired
// into newProxyHandler. Tests run against the real handler, egress.Validator, and
// consent.Service. No external networks are contacted.
//
// Injection strategy: because middleware.userIDKey is unexported, the simplest
// way to inject a validated userID is to wrap each sub-handler under
// JWTAuth.Middleware with a test-only JWT signed by a local test key. This also
// validates that the JWTAuth → proxy handler integration holds.
//
// Each case builds its own *httptest.ResponseRecorder and asserts the HTTP status
// code. Where the gate passes (consent valid, payload valid) and reaches the
// provider router, all providers are stubs that return ErrNotImplemented — the
// router exhausts them and returns an error, so the handler returns 503.
// 503 is the proof-of-pass: the request cleared the gate (would not be 400).

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"github.com/y4nn/wisemoney/services/edge/internal/config"
	"github.com/y4nn/wisemoney/services/edge/internal/consent"
	"github.com/y4nn/wisemoney/services/edge/internal/egress"
	"github.com/y4nn/wisemoney/services/edge/internal/middleware"
	"github.com/y4nn/wisemoney/services/edge/internal/provider"
)

// -- test constants -----------------------------------------------------------

const (
	testUserID        = "user-test-001"
	testJWTKey        = "jwt-signing-key-minimum-32-bytes!!"   // 35 bytes
	testConsentKey    = "consent-signing-key-minimum-32-bytes!" // 37 bytes
	testFeature       = "ai_assistant"
	testConsentTTL    = 5 * time.Minute
)

// -- helpers ------------------------------------------------------------------

// signTestJWT issues an HS256 JWT with sub=userID, exp=+1h.
func signTestJWT(t *testing.T, userID, signingKey string) string {
	t.Helper()
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub": userID,
		"exp": time.Now().Add(time.Hour).Unix(),
		"iat": time.Now().Unix(),
	})
	raw, err := token.SignedString([]byte(signingKey))
	if err != nil {
		t.Fatalf("signTestJWT: %v", err)
	}
	return raw
}

// issueAssertion uses a real consent.Service to issue a valid assertion for
// userID+feature. If expiredOffset is negative the assertion expires in the past.
func issueAssertion(t *testing.T, svc *consent.Service, userID, feature string, expiredOffset time.Duration) string {
	t.Helper()
	// Access the internal issue path indirectly: we construct the assertion by
	// calling HandleAssert over an httptest round-trip so we use only public API.
	body, _ := json.Marshal(map[string]string{"feature": feature})

	// Inject the userID via the JWTAuth middleware on a temporary mux.
	jwtAuth := middleware.NewJWTAuth(testJWTKey)
	mux := http.NewServeMux()
	mux.Handle("POST /v1/consent/assert", jwtAuth.Middleware(http.HandlerFunc(svc.HandleAssert)))

	tok := signTestJWT(t, userID, testJWTKey)
	req := httptest.NewRequest(http.MethodPost, "/v1/consent/assert", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+tok)
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	mux.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("issueAssertion: consent/assert returned %d: %s", rr.Code, rr.Body.String())
	}

	var a consent.ConsentAssertion
	if err := json.Unmarshal(rr.Body.Bytes(), &a); err != nil {
		t.Fatalf("issueAssertion: decode: %v", err)
	}

	if expiredOffset < 0 {
		// Back-date the assertion so it is already expired.
		a.ExpiresAt = time.Now().Add(expiredOffset).Unix()
		// Re-signing is not possible without access to the private sign method,
		// but an expired assertion with the original sig will fail the time check
		// before signature verification (Verify checks exp before sig). Confirmed
		// in consent.Verify: exp check runs before HMAC comparison.
	}

	raw, err := json.Marshal(a)
	if err != nil {
		t.Fatalf("issueAssertion: marshal: %v", err)
	}
	return string(raw)
}

// makeHandler builds a fully wired handler under a JWTAuth wrapper.
func makeHandler(t *testing.T) (http.Handler, *consent.Service) {
	t.Helper()
	cfg := &config.Config{
		JWTSigningKey:       testJWTKey,
		ConsentSigningKey:   testConsentKey,
		ConsentAssertionTTL: testConsentTTL,
	}
	consentSvc := consent.NewService(cfg.ConsentSigningKey, cfg.ConsentAssertionTTL)
	providerRouter := provider.NewRouter(cfg)
	egressValidator := egress.NewValidator()
	handler := newProxyHandler(providerRouter, egressValidator, consentSvc)

	jwtAuth := middleware.NewJWTAuth(testJWTKey)
	return jwtAuth.Middleware(handler), consentSvc
}

// buildRequest constructs a POST /v1/ai/proxy request with the given headers and body.
func buildRequest(t *testing.T, payload map[string]any, egressLevel, feature, assertionJSON string) *http.Request {
	t.Helper()
	body, err := json.Marshal(map[string]any{
		"task_type": "reasoning",
		"payload":   payload,
	})
	if err != nil {
		t.Fatalf("buildRequest: marshal: %v", err)
	}
	req := httptest.NewRequest(http.MethodPost, "/v1/ai/proxy", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+signTestJWT(t, testUserID, testJWTKey))
	if egressLevel != "" {
		req.Header.Set("X-Egress-Level", egressLevel)
	}
	if feature != "" {
		req.Header.Set("X-Feature", feature)
	}
	if assertionJSON != "" {
		req.Header.Set("X-Consent-Assertion", assertionJSON)
	}
	return req
}

// cleanPayload is a minimal redacted-safe payload with no forbidden fields.
var cleanPayload = map[string]any{
	"summary": "monthly spend by category",
}

// fullOnlyPayload contains a forbidden field ("merchant") rejected under "redacted".
var fullOnlyPayload = map[string]any{
	"merchant": "Whole Foods",
	"amount":   4200,
}

// fullPayload is valid under "full" egress (no forbidden fields that must not appear).
var fullPayload = map[string]any{
	"transactions": []map[string]any{
		{"amount": 4200, "date": "2026-06-01"},
	},
}

// -- tests --------------------------------------------------------------------

// (a) Redacted request with a clean payload passes the gate.
// The handler reaches Dispatch, all providers are stubs → 503 (not 400).
func TestProxyGate_RedactedCleanPayload_PassesGate(t *testing.T) {
	handler, _ := makeHandler(t)
	req := buildRequest(t, cleanPayload, "redacted", "", "")
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)
	if rr.Code == http.StatusBadRequest {
		t.Fatalf("expected gate to pass (not 400) but got 400: %s", rr.Body.String())
	}
	if rr.Code != http.StatusServiceUnavailable {
		t.Logf("note: got %d (expected 503 when gate passes and providers are stubs)", rr.Code)
	}
}

// (b) Redacted request with a full-only field ("merchant") → 400.
func TestProxyGate_RedactedForbiddenField_Rejects400(t *testing.T) {
	handler, _ := makeHandler(t)
	req := buildRequest(t, fullOnlyPayload, "redacted", "", "")
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for forbidden field in redacted payload, got %d: %s", rr.Code, rr.Body.String())
	}
}

// (c) Full + valid assertion + matching X-Feature + clean full payload → passes gate (not 400).
func TestProxyGate_FullValidAssertion_PassesGate(t *testing.T) {
	handler, consentSvc := makeHandler(t)
	assertionJSON := issueAssertion(t, consentSvc, testUserID, testFeature, 0)
	req := buildRequest(t, cleanPayload, "full", testFeature, assertionJSON)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)
	if rr.Code == http.StatusBadRequest {
		t.Fatalf("expected gate to pass (not 400) but got 400: %s", rr.Body.String())
	}
}

// (d) Full + full-only-field payload but missing X-Consent-Assertion
// → forced redacted → full-only field rejected → 400.
func TestProxyGate_FullMissingAssertion_ForcedRedacted_Rejects400(t *testing.T) {
	handler, _ := makeHandler(t)
	req := buildRequest(t, fullOnlyPayload, "full", testFeature, "")
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 (forced redacted + forbidden field), got %d: %s", rr.Code, rr.Body.String())
	}
}

// (e) Full + assertion whose feature != X-Feature → forced redacted → if clean payload passes.
// Use cleanPayload so the only observable effect is the downgrade (payload passes as redacted).
// The request should NOT be 400 (payload is clean), proving downgrade happened without 400.
func TestProxyGate_FullFeatureMismatch_ForcedRedacted_CleanPayloadPasses(t *testing.T) {
	handler, consentSvc := makeHandler(t)
	// Assertion issued for "other_feature" but X-Feature says testFeature.
	assertionJSON := issueAssertion(t, consentSvc, testUserID, "other_feature", 0)
	req := buildRequest(t, cleanPayload, "full", testFeature, assertionJSON)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)
	if rr.Code == http.StatusBadRequest {
		t.Fatalf("expected gate to pass (redacted + clean payload, not 400), got 400: %s", rr.Body.String())
	}
}

// (e-forbidden) Full + feature mismatch + full-only-field → forced redacted → 400.
func TestProxyGate_FullFeatureMismatch_ForcedRedacted_ForbiddenFieldRejects400(t *testing.T) {
	handler, consentSvc := makeHandler(t)
	assertionJSON := issueAssertion(t, consentSvc, testUserID, "other_feature", 0)
	req := buildRequest(t, fullOnlyPayload, "full", testFeature, assertionJSON)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 (forced redacted + forbidden field), got %d: %s", rr.Code, rr.Body.String())
	}
}

// (f) Full + expired assertion → forced redacted.
// Use fullOnlyPayload to make the forced-redacted downgrade observable as 400.
func TestProxyGate_FullExpiredAssertion_ForcedRedacted_Rejects400(t *testing.T) {
	handler, consentSvc := makeHandler(t)
	assertionJSON := issueAssertion(t, consentSvc, testUserID, testFeature, -10*time.Minute)
	req := buildRequest(t, fullOnlyPayload, "full", testFeature, assertionJSON)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 (expired assertion → forced redacted + forbidden field), got %d: %s", rr.Code, rr.Body.String())
	}
}

// (g) Full + tampered signature → forced redacted.
// Tamper the sig field and use fullOnlyPayload to observe the forced downgrade as 400.
func TestProxyGate_FullTamperedSignature_ForcedRedacted_Rejects400(t *testing.T) {
	handler, consentSvc := makeHandler(t)
	raw := issueAssertion(t, consentSvc, testUserID, testFeature, 0)

	var a consent.ConsentAssertion
	if err := json.Unmarshal([]byte(raw), &a); err != nil {
		t.Fatalf("unmarshal assertion: %v", err)
	}
	// Flip the last character of the signature to break it.
	sig := []byte(a.Signature)
	if len(sig) > 0 {
		if sig[len(sig)-1] == 'a' {
			sig[len(sig)-1] = 'b'
		} else {
			sig[len(sig)-1] = 'a'
		}
	}
	a.Signature = string(sig)

	tampered, err := json.Marshal(a)
	if err != nil {
		t.Fatalf("marshal tampered assertion: %v", err)
	}

	req := buildRequest(t, fullOnlyPayload, "full", testFeature, string(tampered))
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 (tampered sig → forced redacted + forbidden field), got %d: %s", rr.Code, rr.Body.String())
	}
}

// -- supplementary: malformed assertion JSON → forced redacted ----------------

func TestProxyGate_FullMalformedAssertion_ForcedRedacted_Rejects400(t *testing.T) {
	handler, _ := makeHandler(t)
	req := buildRequest(t, fullOnlyPayload, "full", testFeature, "not-valid-json{")
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 (malformed JSON → forced redacted + forbidden field), got %d: %s", rr.Code, rr.Body.String())
	}
}

// -- supplementary: missing X-Feature with full request → forced redacted ----

func TestProxyGate_FullMissingFeatureHeader_ForcedRedacted_Rejects400(t *testing.T) {
	handler, consentSvc := makeHandler(t)
	assertionJSON := issueAssertion(t, consentSvc, testUserID, testFeature, 0)
	// X-Feature intentionally omitted (empty string in buildRequest skips the header).
	req := buildRequest(t, fullOnlyPayload, "full", "", assertionJSON)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 (missing X-Feature → forced redacted + forbidden field), got %d: %s", rr.Code, rr.Body.String())
	}
}

