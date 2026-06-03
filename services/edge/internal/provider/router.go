package provider

// router.go implements cross-provider fallback routing (FR-AIORCH-05,
// ARCHITECTURE §9). Each task type has a primary and an ordered fallback chain
// across different providers. Same-provider retry does NOT satisfy FR-AIORCH-05.
//
// The routing config is operator-configurable (FR-AIORCH-03): change the routing
// table to re-route a task type without a code change. Provider endpoint URLs
// remain hardcoded (M-PROXY-01).
//
// Graceful degradation (INV-PROXY-04): if every provider in the chain for a task
// type is unavailable, Router.Dispatch returns an error. The handler surfaces a
// clear user message. Financial State is not affected.

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/y4nn/wisemoney/services/edge/internal/config"
)

// taskRouting maps task type names to an ordered list of provider names.
// Primary is index 0; fallbacks are subsequent entries on different providers.
// All entries must refer to providers registered in Router.providers.
//
// TODO(FR-AIORCH-03): make this operator-configurable via an environment variable
// or a config file at startup — currently hardcoded for scaffold clarity.
var taskRouting = map[string][]string{
	"reasoning":      {"gemini", "openai", "nvidia_nim"},
	"classification": {"nvidia_nim", "gemini", "openai"},
	"teaching":       {"openai", "gemini", "nvidia_nim"},
	"summarization":  {"gemini", "openai", "nvidia_nim"},
}

// Router selects the appropriate provider adapter for a task type and applies
// the cross-provider fallback chain.
type Router struct {
	providers map[string]Provider
}

// NewRouter constructs the Router with all provider adapters registered.
func NewRouter(cfg *config.Config) *Router {
	r := &Router{providers: make(map[string]Provider)}
	for _, p := range []Provider{
		NewGeminiAdapter(cfg),
		NewNvidiaNIMAdapter(cfg),
		NewOpenAIAdapter(cfg),
	} {
		r.providers[p.Name()] = p
	}
	return r
}

// Dispatch routes a request to the primary provider for the task type and
// falls back through the chain on failure (FR-AIORCH-05).
// userID is the JWT sub — included for isolation bookkeeping, not for routing logic.
func (r *Router) Dispatch(ctx context.Context, userID, taskType string, payload json.RawMessage) (*NormalizedResponse, error) {
	chain, ok := taskRouting[taskType]
	if !ok {
		return nil, fmt.Errorf("provider: unknown task type %q", taskType)
	}

	var lastErr error
	for _, name := range chain {
		p, found := r.providers[name]
		if !found {
			continue
		}

		resp, err := p.Dispatch(ctx, taskType, payload)
		if err == nil {
			return resp, nil
		}

		// Only continue fallback on availability errors (FR-AIORCH-05).
		// Non-availability errors (e.g. bad request) should not trigger fallback.
		if errors.Is(err, ErrProviderUnavailable) || errors.Is(err, ErrNotImplemented) {
			lastErr = err
			continue
		}

		// Permanent error — stop fallback chain.
		return nil, fmt.Errorf("provider %s: %w", name, err)
	}

	// All providers exhausted (INV-PROXY-04: fail closed, never fabricate).
	return nil, fmt.Errorf("provider: all providers unavailable for task %q: %w", taskType, lastErr)
}
