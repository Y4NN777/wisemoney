// Package provider defines the Provider interface, per-provider adapter stubs,
// and the Router that handles task-type routing and cross-provider fallback.
//
// Architecture invariants:
//   - INV-PROXY-03: every provider response is normalized to NormalizedResponse
//     before it leaves this package. No consumer depends on provider-specific shapes.
//   - FR-AIORCH-05: cross-provider fallback is mandatory. Same-provider retry does
//     NOT satisfy this. The router tries providers in an ordered fallback chain.
//   - INV-PROXY-04: if all providers for a task type fail, the router returns an
//     error; it never fabricates a response.
//   - M-PROXY-01: provider endpoint URLs are hardcoded — no user-configurable URL
//     fields. Routing config selects by name, not URL (SSRF prevention).
//
// Adding a provider: implement the Provider interface + add an adapter in this
// package + add an entry to the routing config in routing.go. No cross-cutting change.
package provider

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
)

// NormalizedResponse is the single internal response shape all consumers depend on
// (INV-PROXY-03). Provider-specific formats never escape this package.
type NormalizedResponse struct {
	// Content is the text content of the AI response.
	Content string

	// Provider identifies which provider produced this response (informational).
	// Never logged alongside payload content (INV-PROXY-02).
	Provider string
}

// Provider is the interface every provider adapter must implement.
// Dispatch sends a task payload to the provider and returns a NormalizedResponse.
// Real API calls are NOT made in stubs — they return ErrNotImplemented.
type Provider interface {
	Name() string
	Dispatch(ctx context.Context, taskType string, payload json.RawMessage) (*NormalizedResponse, error)
}

// ErrNotImplemented is returned by adapter stubs pending real implementation.
var ErrNotImplemented = errors.New("provider: not implemented")

// ErrProviderUnavailable is returned when a provider is unreachable or times out.
// The Router uses this to trigger fallback (FR-AIORCH-05).
var ErrProviderUnavailable = fmt.Errorf("provider: unavailable")
