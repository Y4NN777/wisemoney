package auth

import (
	"net/http"
	"testing"
	"time"
)

func TestAttemptLimiterResetsAfterWindow(t *testing.T) {
	limiter := newAttemptLimiter(2, time.Minute)
	now := time.Unix(100, 0)
	limiter.now = func() time.Time { return now }

	if !limiter.allow("key") || !limiter.allow("key") {
		t.Fatal("initial attempts should be allowed")
	}
	if limiter.allow("key") {
		t.Fatal("attempt above the limit should be rejected")
	}
	now = now.Add(time.Minute)
	if !limiter.allow("key") {
		t.Fatal("attempt should be allowed after the window resets")
	}
}

func TestRequestIPUsesProxyHeadersOnlyWhenExplicitlyTrusted(t *testing.T) {
	request := &http.Request{
		RemoteAddr: "10.0.0.4:1234",
		Header: http.Header{
			"X-Forwarded-For": []string{"203.0.113.9, 10.0.0.4"},
		},
	}
	if got := requestIP(request, false); got != "10.0.0.4" {
		t.Fatalf("untrusted proxy header changed client IP: %q", got)
	}
	if got := requestIP(request, true); got != "203.0.113.9" {
		t.Fatalf("trusted proxy header was not used: %q", got)
	}
}

func TestRequestIPIgnoresMalformedProxyHeaders(t *testing.T) {
	request := &http.Request{
		RemoteAddr: "192.0.2.4:5678",
		Header:     http.Header{"X-Forwarded-For": []string{"not-an-ip"}},
	}
	if got := requestIP(request, true); got != "192.0.2.4" {
		t.Fatalf("malformed proxy header was trusted: %q", got)
	}
}

func TestAccountAttemptKeyIsCaseInsensitive(t *testing.T) {
	if got := accountAttemptKey("  User@Example.COM "); got != "user@example.com" {
		t.Fatalf("accountAttemptKey() = %q", got)
	}
}
