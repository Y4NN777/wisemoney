package auth

import (
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

const (
	authAttemptLimit  = 5
	authAttemptWindow = 15 * time.Minute
)

type attemptWindow struct {
	count   int
	resetAt time.Time
}

type attemptLimiter struct {
	mu      sync.Mutex
	limit   int
	window  time.Duration
	windows map[string]attemptWindow
	now     func() time.Time
}

func newAttemptLimiter(limit int, window time.Duration) *attemptLimiter {
	return &attemptLimiter{
		limit:   limit,
		window:  window,
		windows: make(map[string]attemptWindow),
		now:     time.Now,
	}
}

func (l *attemptLimiter) allow(key string) bool {
	now := l.now()
	l.mu.Lock()
	defer l.mu.Unlock()

	entry, exists := l.windows[key]
	if !exists || !now.Before(entry.resetAt) {
		l.windows[key] = attemptWindow{count: 1, resetAt: now.Add(l.window)}
		l.removeExpired(now)
		return true
	}
	if entry.count >= l.limit {
		return false
	}
	entry.count++
	l.windows[key] = entry
	return true
}

func (l *attemptLimiter) removeExpired(now time.Time) {
	for key, entry := range l.windows {
		if !now.Before(entry.resetAt) {
			delete(l.windows, key)
		}
	}
}

func requestIP(r *http.Request, trustProxyHeaders bool) string {
	if trustProxyHeaders {
		forwarded := strings.Split(r.Header.Get("X-Forwarded-For"), ",")[0]
		if ip := net.ParseIP(strings.TrimSpace(forwarded)); ip != nil {
			return ip.String()
		}
		if ip := net.ParseIP(strings.TrimSpace(r.Header.Get("X-Real-IP"))); ip != nil {
			return ip.String()
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err == nil && host != "" {
		return host
	}
	return r.RemoteAddr
}

func accountAttemptKey(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}
