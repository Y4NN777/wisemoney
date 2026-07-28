package middleware

import (
	"testing"
	"time"
)

func TestRateLimiterEvictsIdleBuckets(t *testing.T) {
	clock := time.Unix(1_700_000_000, 0)
	limiter := NewRateLimiter(2, 10)
	limiter.now = func() time.Time { return clock }

	if !limiter.allow("inactive-user") {
		t.Fatal("first request should be allowed")
	}
	clock = clock.Add(limiter.idleTTL + time.Minute)
	if !limiter.allow("active-user") {
		t.Fatal("first request for active user should be allowed")
	}
	if _, exists := limiter.buckets["inactive-user"]; exists {
		t.Fatal("idle bucket was not evicted")
	}
}

func TestRateLimiterEnforcesBurstAndRefills(t *testing.T) {
	clock := time.Unix(1_700_000_000, 0)
	limiter := NewRateLimiter(2, 2)
	limiter.now = func() time.Time { return clock }

	if !limiter.allow("user") || !limiter.allow("user") {
		t.Fatal("initial burst should be allowed")
	}
	if limiter.allow("user") {
		t.Fatal("request beyond burst should be rejected")
	}
	clock = clock.Add(500 * time.Millisecond)
	if !limiter.allow("user") {
		t.Fatal("one token should refill after 500ms at 2 rps")
	}
}
