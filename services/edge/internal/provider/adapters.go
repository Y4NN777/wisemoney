package provider

// adapters.go contains stub implementations of the Provider interface for each
// supported AI provider. None of these make real API calls — they document the
// wiring points and return ErrNotImplemented.
//
// Provider endpoint URLs are hardcoded constants (M-PROXY-01: SSRF prevention).
// They are NOT runtime-configurable. Adding a provider requires a code change.
//
// Invariants:
//   - INV-KEY-01: managed provider API keys are server-side only. Adapters read
//     keys from Config — they are never transmitted to any client.
//   - INV-PROXY-02: adapters must never log request bodies or API key values.

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/y4nn/wisemoney/services/edge/internal/config"
)

// Hardcoded provider base URLs (M-PROXY-01: not user-configurable).
const (
	geminiBaseURL    = "https://generativelanguage.googleapis.com"
	nvidiaNIMBaseURL = "https://integrate.api.nvidia.com"
	openAIBaseURL    = "https://api.openai.com"
)

// -- Gemini -------------------------------------------------------------------

// GeminiAdapter adapts the Gemini API to the Provider interface.
type GeminiAdapter struct {
	apiKey string // server-side only (INV-KEY-01)
}

func NewGeminiAdapter(cfg *config.Config) *GeminiAdapter {
	return &GeminiAdapter{apiKey: cfg.GeminiAPIKey}
}

func (a *GeminiAdapter) Name() string { return "gemini" }

func (a *GeminiAdapter) Dispatch(ctx context.Context, taskType string, payload json.RawMessage) (*NormalizedResponse, error) {
	// TODO(FR-AIORCH-03): map taskType to the appropriate Gemini model.
	// TODO(impl): construct the Gemini API request; POST to geminiBaseURL.
	// TODO(INV-PROXY-02): never log the payload or a.apiKey.
	// TODO(INV-PROXY-03): normalize the Gemini response to NormalizedResponse.
	_ = geminiBaseURL
	_ = ctx
	_ = taskType
	_ = payload
	return nil, fmt.Errorf("%w: gemini adapter not yet implemented", ErrNotImplemented)
}

// -- NVIDIA NIM ---------------------------------------------------------------

// NvidiaNIMAdapter adapts the NVIDIA NIM API to the Provider interface.
type NvidiaNIMAdapter struct {
	apiKey string // server-side only (INV-KEY-01)
}

func NewNvidiaNIMAdapter(cfg *config.Config) *NvidiaNIMAdapter {
	return &NvidiaNIMAdapter{apiKey: cfg.NvidiaNIMAPIKey}
}

func (a *NvidiaNIMAdapter) Name() string { return "nvidia_nim" }

func (a *NvidiaNIMAdapter) Dispatch(ctx context.Context, taskType string, payload json.RawMessage) (*NormalizedResponse, error) {
	// TODO(FR-AIORCH-03): map taskType to the appropriate NIM model.
	// TODO(impl): construct the NIM API request; POST to nvidiaNIMBaseURL.
	// TODO(INV-PROXY-02): never log the payload or a.apiKey.
	// TODO(INV-PROXY-03): normalize the NIM response to NormalizedResponse.
	_ = nvidiaNIMBaseURL
	_ = ctx
	_ = taskType
	_ = payload
	return nil, fmt.Errorf("%w: nvidia nim adapter not yet implemented", ErrNotImplemented)
}

// -- OpenAI -------------------------------------------------------------------

// OpenAIAdapter adapts the OpenAI API to the Provider interface.
type OpenAIAdapter struct {
	apiKey string // server-side only (INV-KEY-01)
}

func NewOpenAIAdapter(cfg *config.Config) *OpenAIAdapter {
	return &OpenAIAdapter{apiKey: cfg.OpenAIAPIKey}
}

func (a *OpenAIAdapter) Name() string { return "openai" }

func (a *OpenAIAdapter) Dispatch(ctx context.Context, taskType string, payload json.RawMessage) (*NormalizedResponse, error) {
	// TODO(FR-AIORCH-03): map taskType to the appropriate OpenAI model.
	// TODO(impl): construct the OpenAI chat completion request; POST to openAIBaseURL.
	// TODO(INV-PROXY-02): never log the payload or a.apiKey.
	// TODO(INV-PROXY-03): normalize the OpenAI response to NormalizedResponse.
	_ = openAIBaseURL
	_ = ctx
	_ = taskType
	_ = payload
	return nil, fmt.Errorf("%w: openai adapter not yet implemented", ErrNotImplemented)
}
