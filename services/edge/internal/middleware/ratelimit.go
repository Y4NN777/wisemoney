package middleware

// RateLimiter implements a per-user in-memory token bucket (Gate-4 #20).
//
// Design:
//   - State is per-user, keyed exclusively on the JWT sub claim from context
//     (INV-AUTH-04: per-user isolation is absolute; no shared anonymous pool).
//   - The bucket map is protected by sync.Mutex. A future scale-out replaces
//     the map with a Redis client — no Postgres schema change required
//     (ARCHITECTURE §11 documented scale-out path).
//   - State is lost on process restart; acceptable at MVP scale (THREAT_MODEL §2.8
//     D-PROXY-01 accepted risk).
//
// TODO(scale-out): replace sync.Mutex + map with a Redis token-bucket adapter
// when horizontal scaling or persistence across restarts is required.

import (
	"net/http"
	"sync"
	"time"
)

// bucket holds the token-bucket state for one user.
type bucket struct {
	tokens     float64
	lastRefill time.Time
}

// RateLimiter is a per-user token-bucket rate limiter.
type RateLimiter struct {
	rps      float64 // token refill rate (tokens per second)
	capacity float64 // maximum burst capacity

	mu      sync.Mutex
	buckets map[string]*bucket
}

// NewRateLimiter constructs a RateLimiter.
// rps is the sustained request rate; burst is the peak capacity.
func NewRateLimiter(rps float64, burst int) *RateLimiter {
	return &RateLimiter{
		rps:      rps,
		capacity: float64(burst),
		buckets:  make(map[string]*bucket),
	}
}

// Middleware is the chi-compatible handler wrapper.
// It must be installed after JWTAuth so UserIDFromContext is populated.
func (rl *RateLimiter) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		userID := UserIDFromContext(r.Context())
		if userID == "" {
			// Should not reach here if JWTAuth is installed first.
			writeUnauthorized(w)
			return
		}

		if !rl.allow(userID) {
			w.Header().Set("Content-Type", "application/json")
			w.Header().Set("Retry-After", "1")
			w.WriteHeader(http.StatusTooManyRequests)
			_, _ = w.Write([]byte(`{"error":"rate_limit_exceeded"}`))
			return
		}

		next.ServeHTTP(w, r)
	})
}

// allow returns true if the user has a token available and consumes one.
func (rl *RateLimiter) allow(userID string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	b, ok := rl.buckets[userID]
	if !ok {
		// First request for this user: start full.
		rl.buckets[userID] = &bucket{tokens: rl.capacity, lastRefill: now}
		b = rl.buckets[userID]
	}

	// Refill based on elapsed time.
	elapsed := now.Sub(b.lastRefill).Seconds()
	b.tokens = min(rl.capacity, b.tokens+elapsed*rl.rps)
	b.lastRefill = now

	if b.tokens < 1 {
		return false
	}
	b.tokens--
	return true
}

func min(a, b float64) float64 {
	if a < b {
		return a
	}
	return b
}
