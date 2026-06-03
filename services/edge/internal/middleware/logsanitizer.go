package middleware

// LogSanitizer is the outermost middleware on every route. It intercepts the
// response and logs ONLY metadata: method, path, status, latency, and user ID.
//
// It MUST NEVER log:
//   - The Authorization header (contains JWT — INV-PROXY-02, M-KEY-04).
//   - Any api_key field in the request or response body.
//   - The request or response body content (may contain AI context / financial
//     data in full-egress mode — INV-PROXY-01, INV-PROXY-02, M-PROXY-03).
//
// This is a structural control (THREAT_MODEL §2.8 I-PROXY-01): safe-by-default
// logging that cannot accidentally expose key material or financial payloads
// regardless of which handlers log below it.

import (
	"fmt"
	"net/http"
	"time"
)

// responseRecorder wraps http.ResponseWriter to capture the status code for
// logging without buffering the body (body must NEVER be logged — INV-PROXY-02).
type responseRecorder struct {
	http.ResponseWriter
	status int
}

func (rr *responseRecorder) WriteHeader(status int) {
	rr.status = status
	rr.ResponseWriter.WriteHeader(status)
}

// LogSanitizer is the chi-compatible middleware function.
func LogSanitizer(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()

		rr := &responseRecorder{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(rr, r)

		// Metadata only. No body, no Authorization, no api_key.
		// User ID comes from context (post-auth) — may be empty on unauthenticated routes.
		userID := UserIDFromContext(r.Context())
		if userID == "" {
			userID = "-"
		}

		// TODO(observability): replace fmt.Printf with a structured logger
		// (e.g. log/slog from stdlib) that writes JSON to stdout.
		// Fields: timestamp, method, path, status, latency_ms, user_id.
		// Never add: body, headers["Authorization"], any api_key field.
		fmt.Printf(
			"method=%s path=%s status=%d latency_ms=%d user_id=%s\n",
			r.Method,
			r.URL.Path,
			rr.status,
			time.Since(start).Milliseconds(),
			userID,
		)
	})
}
