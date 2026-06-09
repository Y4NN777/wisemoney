// Package httpapi wires the chi router, middleware chain, and route handlers
// for the WiseMoney managed edge.
//
// Route layout:
//
//	GET  /health                 — unauthenticated liveness probe
//	POST /v1/auth/register       — user registration (INV-AUTH-02)
//	POST /v1/auth/login          — login; issues access JWT + refresh token
//	POST /v1/auth/refresh        — refresh-token rotation (INV-AUTH-03)
//	POST /v1/ai/proxy            — authenticated AI proxy (INV-AUTH-01, INV-PROXY-*)
//	POST /v1/consent/assert      — issue short-lived consent assertion (AQ-01, THREAT_MODEL §3)
//
// Middleware chain for authenticated routes:
//
//	LogSanitizer → JWTAuth → RateLimit → (handler)
//
// LogSanitizer sits outermost so it catches even auth-layer errors without
// logging Authorization headers or financial payloads (INV-PROXY-02, M-PROXY-03).
package httpapi

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	chiMiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/y4nn/wisemoney/services/edge/internal/auth"
	"github.com/y4nn/wisemoney/services/edge/internal/config"
	"github.com/y4nn/wisemoney/services/edge/internal/consent"
	"github.com/y4nn/wisemoney/services/edge/internal/egress"
	"github.com/y4nn/wisemoney/services/edge/internal/middleware"
	"github.com/y4nn/wisemoney/services/edge/internal/provider"
	"github.com/y4nn/wisemoney/services/edge/internal/store"
)

// Body-size ceilings (MED-01, CWE-400: request body DoS prevention).
// Limits are applied per-handler via withBodyLimit so each endpoint carries
// only as much budget as its payload legitimately requires.
const (
	// bodySizeSmall caps credential and feature-name endpoints. 8 KiB is
	// several orders of magnitude above any valid JSON body for these routes
	// (email ≤ 254 bytes, password ≤ 128 bytes, feature name small).
	bodySizeSmall = 8 * 1024 // 8 KiB

	// bodySizeProxy caps the AI proxy endpoint. The redacted AI payload is the
	// largest legitimate body on the edge; 1 MiB prevents unbounded memory
	// allocation while accommodating typical context windows.
	bodySizeProxy = 1 * 1024 * 1024 // 1 MiB
)

// withBodyLimit wraps h so that r.Body is capped at maxBytes before the handler
// reads it. On exceed, json.Decode returns an error and the handler returns 413.
// (MED-01, CWE-400)
func withBodyLimit(maxBytes int64, h http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r.Body = http.MaxBytesReader(w, r.Body, maxBytes)
		h(w, r)
	}
}

// NewRouter constructs and returns the fully-wired chi router.
func NewRouter(cfg *config.Config, pool *pgxpool.Pool) http.Handler {
	r := chi.NewRouter()

	// Base middleware applied to all routes (including health).
	// chi.Logger is NOT used directly — LogSanitizer is the only log middleware
	// so it can enforce INV-PROXY-02 before anything else writes a log entry.
	r.Use(chiMiddleware.Recoverer)
	r.Use(middleware.LogSanitizer)

	// Unauthenticated routes.
	r.Get("/health", healthHandler)

	userRepo := store.NewUserRepository(pool)
	tokenRepo := store.NewRefreshTokenRepository(pool)
	authSvc := auth.NewService(cfg, userRepo, tokenRepo)

	// bodySizeSmall applied to all auth endpoints: credentials + refresh token
	// bodies are tiny; capping at 8 KiB prevents body-exhaustion DoS (MED-01).
	r.Post("/v1/auth/register", withBodyLimit(bodySizeSmall, authSvc.HandleRegister))
	r.Post("/v1/auth/login", withBodyLimit(bodySizeSmall, authSvc.HandleLogin))
	r.Post("/v1/auth/refresh", withBodyLimit(bodySizeSmall, authSvc.HandleRefresh))

	// Authenticated + rate-limited routes.
	jwtAuth := middleware.NewJWTAuth(cfg.JWTSigningKey)
	rateLimiter := middleware.NewRateLimiter(cfg.RateLimitRPS, cfg.RateLimitBurst)

	r.Group(func(r chi.Router) {
		r.Use(jwtAuth.Middleware)
		r.Use(rateLimiter.Middleware)

		// Dedicated consent-assertion key, separate from the JWT key (Gate-5;
		// ARCHITECTURE §10a "Consent-assertion contract").
		consentSvc := consent.NewService(cfg.ConsentSigningKey, cfg.ConsentAssertionTTL)
		providerRouter := provider.NewRouter(cfg)
		egressValidator := egress.NewValidator()

		// consentSvc gates full-egress in the proxy handler: valid HMAC + not
		// expired + user_id == JWT sub + feature == X-Feature + level == "full"
		// required; any failure forces redacted (INV-EGR-03a, ARCHITECTURE §10a).
		//
		// bodySizeProxy (1 MiB) on /v1/ai/proxy: AI context payloads can be larger
		// than credential bodies but must still be bounded (MED-01, CWE-400).
		r.Post("/v1/ai/proxy", withBodyLimit(bodySizeProxy, newProxyHandler(providerRouter, egressValidator, consentSvc)))

		// bodySizeSmall on /v1/consent/assert: body carries only a feature name (MED-01).
		r.Post("/v1/consent/assert", withBodyLimit(bodySizeSmall, consentSvc.HandleAssert))
	})

	return r
}

func healthHandler(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(`{"status":"ok"}`))
}
