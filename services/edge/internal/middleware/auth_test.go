package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const middlewareTestKey = "middleware-test-signing-key-32-bytes"

func signedMiddlewareToken(t *testing.T, issuer string) string {
	t.Helper()
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub": "user-1",
		"iss": issuer,
		"exp": time.Now().Add(time.Hour).Unix(),
	})
	raw, err := token.SignedString([]byte(middlewareTestKey))
	if err != nil {
		t.Fatal(err)
	}
	return raw
}

func TestJWTAuthRequiresWiseMoneyIssuer(t *testing.T) {
	auth := NewJWTAuth(middlewareTestKey)
	next := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})

	for _, test := range []struct {
		name       string
		issuer     string
		wantStatus int
	}{
		{name: "expected issuer", issuer: "wisemoney-edge", wantStatus: http.StatusNoContent},
		{name: "foreign issuer", issuer: "other-service", wantStatus: http.StatusUnauthorized},
		{name: "missing issuer", issuer: "", wantStatus: http.StatusUnauthorized},
	} {
		t.Run(test.name, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodGet, "/", nil)
			request.Header.Set("Authorization", "Bearer "+signedMiddlewareToken(t, test.issuer))
			response := httptest.NewRecorder()
			auth.Middleware(next).ServeHTTP(response, request)
			if response.Code != test.wantStatus {
				t.Fatalf("got %d, want %d", response.Code, test.wantStatus)
			}
		})
	}
}
