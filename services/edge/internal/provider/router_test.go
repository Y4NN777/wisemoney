package provider

import (
	"context"
	"encoding/json"
	"errors"
	"sync"
	"testing"
	"time"
)

type providerFunc struct {
	name     string
	dispatch func(context.Context) (*NormalizedResponse, error)
}

func (p providerFunc) Name() string { return p.name }

func (p providerFunc) Dispatch(ctx context.Context, _ string, _ json.RawMessage) (*NormalizedResponse, error) {
	return p.dispatch(ctx)
}

func TestRouterFallsBackAfterAttemptTimeout(t *testing.T) {
	var mu sync.Mutex
	attempts := make([]string, 0, 2)
	router := &Router{
		attemptTimeout: 10 * time.Millisecond,
		providers: map[string]Provider{
			"openrouter": providerFunc{name: "openrouter", dispatch: func(ctx context.Context) (*NormalizedResponse, error) {
				<-ctx.Done()
				mu.Lock()
				attempts = append(attempts, "openrouter")
				mu.Unlock()
				return nil, ErrProviderUnavailable
			}},
			"gemini": providerFunc{name: "gemini", dispatch: func(context.Context) (*NormalizedResponse, error) {
				mu.Lock()
				attempts = append(attempts, "gemini")
				mu.Unlock()
				return &NormalizedResponse{Content: "ok", Provider: "gemini"}, nil
			}},
		},
	}

	response, err := router.Dispatch(context.Background(), "user", "reasoning", json.RawMessage(`{}`))
	if err != nil {
		t.Fatal(err)
	}
	if response.Provider != "gemini" {
		t.Fatalf("unexpected provider %q", response.Provider)
	}
	mu.Lock()
	defer mu.Unlock()
	if len(attempts) != 2 || attempts[0] != "openrouter" || attempts[1] != "gemini" {
		t.Fatalf("unexpected attempts: %#v", attempts)
	}
}

func TestRouterStopsFallbackWhenRequestIsCancelled(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	attemptedFallback := false
	router := &Router{
		attemptTimeout: time.Second,
		providers: map[string]Provider{
			"openrouter": providerFunc{name: "openrouter", dispatch: func(context.Context) (*NormalizedResponse, error) {
				cancel()
				return nil, ErrProviderUnavailable
			}},
			"gemini": providerFunc{name: "gemini", dispatch: func(context.Context) (*NormalizedResponse, error) {
				attemptedFallback = true
				return nil, ErrProviderUnavailable
			}},
		},
	}

	_, err := router.Dispatch(ctx, "user", "reasoning", json.RawMessage(`{}`))
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("expected context cancellation, got %v", err)
	}
	if attemptedFallback {
		t.Fatal("fallback provider was called after request cancellation")
	}
}
