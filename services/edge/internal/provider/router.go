package provider

// router.go implements cross-provider fallback routing (FR-AIORCH-05,
// ARCHITECTURE §9). Each task type has a primary and an ordered fallback chain
// across different providers. Same-provider retry does NOT satisfy FR-AIORCH-05.
//
// Provider registration is operator-configurable through API-key presence.
// Route order and provider endpoint URLs remain hardcoded (M-PROXY-01).
//
// Graceful degradation (INV-PROXY-04): if every provider in the chain for a task
// type is unavailable, Router.Dispatch returns an error. The handler surfaces a
// clear user message. Financial State is not affected.

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/y4nn/wisemoney/services/edge/internal/config"
)

// ErrUnknownTaskType identifies a client contract error, not provider outage.
var ErrUnknownTaskType = errors.New("unknown task type")

const (
	defaultProviderAttemptTimeout  = 20 * time.Second
	defaultProviderDispatchTimeout = 55 * time.Second
)

// taskRouting maps task type names to an ordered list of provider names.
// Primary is index 0; fallbacks are subsequent entries on different providers.
// All entries must refer to providers registered in Router.providers.
var taskRouting = map[string][]string{
	"reasoning":      {"openrouter", "gemini", "deepseek"},
	"classification": {"openrouter", "gemini", "deepseek"},
	"teaching":       {"openrouter", "gemini", "deepseek"},
	"summarization":  {"openrouter", "gemini", "deepseek"},
}

// IsSupportedTaskType reports whether taskType has a configured routing contract.
func IsSupportedTaskType(taskType string) bool {
	_, ok := taskRouting[taskType]
	return ok
}

// Router selects the appropriate provider adapter for a task type and applies
// the cross-provider fallback chain.
type Router struct {
	providers       map[string]Provider
	attemptTimeout  time.Duration
	dispatchTimeout time.Duration
}

// NewRouter constructs the Router with all provider adapters registered.
func NewRouter(cfg *config.Config) *Router {
	r := &Router{
		providers:       make(map[string]Provider),
		attemptTimeout:  defaultProviderAttemptTimeout,
		dispatchTimeout: defaultProviderDispatchTimeout,
	}
	if cfg.OpenRouterAPIKey != "" {
		r.providers["openrouter"] = NewOpenRouterAdapter(cfg)
	}
	if cfg.GeminiAPIKey != "" {
		r.providers["gemini"] = NewGeminiAdapter(cfg)
	}
	if cfg.DeepSeekAPIKey != "" {
		r.providers["deepseek"] = NewDeepSeekAdapter(cfg)
	}
	return r
}

// Dispatch routes a request to the primary provider for the task type and
// falls back through the chain on failure (FR-AIORCH-05).
// userID is the JWT sub — included for isolation bookkeeping, not for routing logic.
func (r *Router) Dispatch(ctx context.Context, userID, taskType string, payload json.RawMessage) (*NormalizedResponse, error) {
	chain, ok := taskRouting[taskType]
	if !ok {
		return nil, fmt.Errorf("provider: %w %q", ErrUnknownTaskType, taskType)
	}

	dispatchTimeout := r.dispatchTimeout
	if dispatchTimeout <= 0 {
		dispatchTimeout = defaultProviderDispatchTimeout
	}
	dispatchCtx, cancelDispatch := context.WithTimeout(ctx, dispatchTimeout)
	defer cancelDispatch()

	var lastErr error
	for _, name := range chain {
		p, found := r.providers[name]
		if !found {
			continue
		}

		attemptTimeout := r.attemptTimeout
		if attemptTimeout <= 0 {
			attemptTimeout = defaultProviderAttemptTimeout
		}
		attemptCtx, cancel := context.WithTimeout(dispatchCtx, attemptTimeout)
		resp, err := p.Dispatch(attemptCtx, taskType, payload)
		cancel()
		if err == nil {
			return resp, nil
		}
		if ctx.Err() != nil {
			return nil, fmt.Errorf("provider: request cancelled: %w", ctx.Err())
		}

		// Only continue fallback on availability errors (FR-AIORCH-05).
		// Non-availability errors (e.g. bad request) should not trigger fallback.
		if errors.Is(err, ErrProviderUnavailable) {
			lastErr = err
			continue
		}

		// Permanent error — stop fallback chain.
		return nil, fmt.Errorf("provider %s: %w", name, err)
	}

	// All providers exhausted (INV-PROXY-04: fail closed, never fabricate).
	if lastErr == nil {
		lastErr = ErrProviderUnavailable
	}
	return nil, fmt.Errorf("provider: all providers unavailable for task %q: %w", taskType, lastErr)
}
