package httpapi

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"github.com/y4nn/wisemoney/services/edge/internal/config"
	"github.com/y4nn/wisemoney/services/edge/internal/egress"
	"github.com/y4nn/wisemoney/services/edge/internal/middleware"
	"github.com/y4nn/wisemoney/services/edge/internal/provider"
)

const (
	testUserID = "user-test-001"
	testJWTKey = "jwt-signing-key-minimum-32-bytes!!"
)

var cleanPayload = map[string]any{
	"periodTotalsPerCategory": map[string]any{},
	"totalIncome":             map[string]any{"minorUnits": 0, "currency": "XOF"},
	"totalExpenses":           map[string]any{"minorUnits": 0, "currency": "XOF"},
	"netCashFlow":             map[string]any{"minorUnits": 0, "currency": "XOF"},
	"budgetStatusPercent":     map[string]any{},
	"goalProgressPercent":     map[string]any{},
	"trendDirection":          map[string]any{},
}

func signTestJWT(t *testing.T) string {
	t.Helper()
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub": testUserID,
		"iss": "wisemoney-edge",
		"exp": time.Now().Add(time.Hour).Unix(),
		"iat": time.Now().Unix(),
	})
	raw, err := token.SignedString([]byte(testJWTKey))
	if err != nil {
		t.Fatal(err)
	}
	return raw
}

func makeHandler(t *testing.T) http.Handler {
	t.Helper()
	cfg := &config.Config{JWTSigningKey: testJWTKey}
	handler := newProxyHandler(provider.NewRouter(cfg), egress.NewValidator())
	return middleware.NewJWTAuth(testJWTKey).Middleware(handler)
}

func buildRequest(t *testing.T, payload map[string]any, level string) *http.Request {
	t.Helper()
	body, err := json.Marshal(map[string]any{"task_type": "reasoning", "payload": payload})
	if err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodPost, "/v1/ai/proxy", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+signTestJWT(t))
	req.Header.Set("X-Egress-Level", level)
	return req
}

func TestProxyManagedPayloadCeiling(t *testing.T) {
	for _, level := range []string{"", "redacted", "full", "unexpected"} {
		t.Run(level, func(t *testing.T) {
			handler := makeHandler(t)
			fullPayload := map[string]any{"transactions": []map[string]any{{"amount": 4200}}}
			rr := httptest.NewRecorder()
			handler.ServeHTTP(rr, buildRequest(t, fullPayload, level))
			if rr.Code != http.StatusBadRequest {
				t.Fatalf("level %q returned %d, want 400: %s", level, rr.Code, rr.Body.String())
			}
		})
	}
}

func TestProxyCleanRedactedPayloadPassesValidation(t *testing.T) {
	rr := httptest.NewRecorder()
	makeHandler(t).ServeHTTP(rr, buildRequest(t, cleanPayload, "redacted"))
	if rr.Code == http.StatusBadRequest {
		t.Fatalf("aggregate payload failed validation: %s", rr.Body.String())
	}
}

func TestProxyRejectsUnknownTaskType(t *testing.T) {
	body, err := json.Marshal(map[string]any{"task_type": "unknown", "payload": cleanPayload})
	if err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodPost, "/v1/ai/proxy", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+signTestJWT(t))
	rr := httptest.NewRecorder()
	makeHandler(t).ServeHTTP(rr, req)
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("got %d, want 400: %s", rr.Code, rr.Body.String())
	}
}

func TestProxyRejectsUnknownFieldsAndTrailingJSON(t *testing.T) {
	payload, err := json.Marshal(cleanPayload)
	if err != nil {
		t.Fatal(err)
	}
	for _, body := range []string{
		fmt.Sprintf(`{"task_type":"reasoning","payload":%s,"extra":true}`, payload),
		fmt.Sprintf(`{"task_type":"reasoning","payload":%s} {}`, payload),
	} {
		req := httptest.NewRequest(http.MethodPost, "/v1/ai/proxy", strings.NewReader(body))
		req.Header.Set("Authorization", "Bearer "+signTestJWT(t))
		rr := httptest.NewRecorder()
		makeHandler(t).ServeHTTP(rr, req)
		if rr.Code != http.StatusBadRequest {
			t.Fatalf("invalid body returned %d: %s", rr.Code, rr.Body.String())
		}
	}
}

func TestProxyRejectsOversizedPrompt(t *testing.T) {
	body, err := json.Marshal(map[string]any{
		"task_type": "teaching",
		"payload":   cleanPayload,
		"prompt":    strings.Repeat("a", maxPromptRunes+1),
	})
	if err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodPost, "/v1/ai/proxy", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+signTestJWT(t))
	rr := httptest.NewRecorder()
	makeHandler(t).ServeHTTP(rr, req)
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("got %d, want 400: %s", rr.Code, rr.Body.String())
	}
}
