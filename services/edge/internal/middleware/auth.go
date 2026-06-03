// Package middleware contains the three-layer middleware chain for authenticated
// routes: JWTAuth → RateLimit → LogSanitizer.
//
// JWTAuth enforces INV-AUTH-01: every authenticated route rejects requests without
// a valid, unexpired, server-signed JWT. There is no unauthenticated path to proxy
// functionality.
package middleware

import (
	"context"
	"net/http"
	"strings"

	"github.com/golang-jwt/jwt/v5"
)

type contextKey string

const userIDKey contextKey = "user_id"

// JWTAuth validates the Bearer token on every request that passes through it.
// All routing decisions downstream use the JWT sub claim exclusively —
// no client-supplied user ID is ever trusted (INV-AUTH-04, M-AUTH-06).
type JWTAuth struct {
	signingKey []byte
}

// NewJWTAuth constructs a JWTAuth middleware. signingKey is the server-only
// HMAC-SHA256 signing key (INV-AUTH-03).
func NewJWTAuth(signingKey string) *JWTAuth {
	return &JWTAuth{signingKey: []byte(signingKey)}
}

// Middleware is the chi-compatible handler wrapper.
func (a *JWTAuth) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw := extractBearerToken(r)
		if raw == "" {
			writeUnauthorized(w)
			return
		}

		token, err := jwt.Parse(raw, func(t *jwt.Token) (any, error) {
			if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, jwt.ErrSignatureInvalid
			}
			return a.signingKey, nil
		}, jwt.WithExpirationRequired())

		if err != nil || !token.Valid {
			writeUnauthorized(w)
			return
		}

		sub, err := token.Claims.GetSubject()
		if err != nil || sub == "" {
			writeUnauthorized(w)
			return
		}

		// Inject the validated user ID into context so downstream handlers and
		// the rate limiter can key on it without touching request headers.
		ctx := context.WithValue(r.Context(), userIDKey, sub)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// UserIDFromContext returns the validated JWT sub claim injected by JWTAuth.
// Returns empty string if the value is absent (should not happen on authenticated routes).
func UserIDFromContext(ctx context.Context) string {
	v, _ := ctx.Value(userIDKey).(string)
	return v
}

func extractBearerToken(r *http.Request) string {
	h := r.Header.Get("Authorization")
	if !strings.HasPrefix(h, "Bearer ") {
		return ""
	}
	return strings.TrimPrefix(h, "Bearer ")
}

func writeUnauthorized(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusUnauthorized)
	_, _ = w.Write([]byte(`{"error":"unauthorized"}`))
}
