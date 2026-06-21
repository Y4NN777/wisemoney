package provider

// adapters.go contains real Provider implementations for Gemini, NVIDIA NIM,
// and OpenAI. Each adapter constructs the appropriate API request, sends it
// via net/http, and normalizes the response (INV-PROXY-03).
//
// Provider endpoint URLs are hardcoded constants (M-PROXY-01: SSRF prevention).
// They are NOT runtime-configurable. Adding a provider requires a code change.
//
// Invariants:
//   - INV-KEY-01: managed provider API keys are server-side only. Adapters read
//     keys from Config — they are never transmitted to any client.
//   - INV-PROXY-02: adapters must never log request bodies or API key values.
//
// Error wrapping convention:
//   - Network/transport errors and 5xx responses wrap ErrProviderUnavailable so
//     the Router can trigger fallback (FR-AIORCH-05).
//   - Other errors (4xx, malformed data, parse failures) are plain errors —
//     the Router treats them as permanent and stops the fallback chain.

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/y4nn/wisemoney/services/edge/internal/config"
)

// Hardcoded provider base URLs (M-PROXY-01: not user-configurable).
const (
	geminiBaseURL    = "https://generativelanguage.googleapis.com"
	nvidiaNIMBaseURL = "https://integrate.api.nvidia.com"
	openAIBaseURL    = "https://api.openai.com"
)

// Model mapping per task type (FR-AIORCH-02).
var taskModelMap = map[string]map[string]string{
	"gemini": {
		"reasoning":      "gemini-2.0-flash",
		"classification": "gemini-2.0-flash",
		"teaching":       "gemini-2.0-flash",
		"summarization":  "gemini-2.0-flash",
	},
	"nvidia_nim": {
		"reasoning":      "meta/llama-3.1-405b-instruct",
		"classification": "meta/llama-3.1-405b-instruct",
		"teaching":       "meta/llama-3.1-405b-instruct",
		"summarization":  "meta/llama-3.1-405b-instruct",
	},
	"openai": {
		"reasoning":      "gpt-4o",
		"classification": "gpt-4o-mini",
		"teaching":       "gpt-4o",
		"summarization":  "gpt-4o-mini",
	},
}

// Shared HTTP client with a reasonable timeout.
var httpClient = &http.Client{Timeout: 30 * time.Second}

// ---------------------------------------------------------------------------
// Gemini
// ---------------------------------------------------------------------------

type geminiRequest struct {
	Contents []geminiContent `json:"contents"`
}

type geminiContent struct {
	Parts []geminiPart `json:"parts"`
}

type geminiPart struct {
	Text string `json:"text"`
}

type geminiResponse struct {
	Candidates []struct {
		Content geminiContent `json:"content"`
	} `json:"candidates"`
}

// GeminiAdapter adapts the Gemini API to the Provider interface.
type GeminiAdapter struct {
	apiKey string
}

func NewGeminiAdapter(cfg *config.Config) *GeminiAdapter {
	return &GeminiAdapter{apiKey: cfg.GeminiAPIKey}
}

func (a *GeminiAdapter) Name() string { return "gemini" }

func (a *GeminiAdapter) Dispatch(ctx context.Context, taskType string, payload json.RawMessage) (*NormalizedResponse, error) {
	model, ok := taskModelMap["gemini"][taskType]
	if !ok {
		model = "gemini-2.0-flash"
	}

	url := geminiBaseURL + "/v1beta/models/" + model + ":generateContent"

	reqBody := geminiRequest{
		Contents: []geminiContent{
			{Parts: []geminiPart{{Text: string(payload)}}},
		},
	}

	bodyBytes, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("gemini: marshal: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, fmt.Errorf("gemini: new request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-goog-api-key", a.apiKey)

	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("gemini: request failed: %w", ErrProviderUnavailable)
	}
	defer resp.Body.Close()

	respBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("gemini: read response: %w", err)
	}

	if resp.StatusCode >= 500 {
		return nil, fmt.Errorf("gemini: status %d: %w", resp.StatusCode, ErrProviderUnavailable)
	}
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("gemini: status %d", resp.StatusCode)
	}

	var geminiResp geminiResponse
	if err := json.Unmarshal(respBytes, &geminiResp); err != nil {
		return nil, fmt.Errorf("gemini: unmarshal response: %w", err)
	}

	if len(geminiResp.Candidates) == 0 {
		return nil, fmt.Errorf("gemini: no candidates: %w", ErrProviderUnavailable)
	}

	var text string
	for _, part := range geminiResp.Candidates[0].Content.Parts {
		text += part.Text
	}

	return &NormalizedResponse{Content: text, Provider: "gemini"}, nil
}

// ---------------------------------------------------------------------------
// NVIDIA NIM
// ---------------------------------------------------------------------------

type openAICompatRequest struct {
	Model       string              `json:"model"`
	Messages    []openAICompatMsg   `json:"messages"`
	Temperature float64             `json:"temperature"`
	MaxTokens   int                 `json:"max_tokens"`
}

type openAICompatMsg struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type openAICompatResponse struct {
	Choices []struct {
		Message openAICompatMsg `json:"message"`
	} `json:"choices"`
}

// NvidiaNIMAdapter adapts the NVIDIA NIM API to the Provider interface.
type NvidiaNIMAdapter struct {
	apiKey string
}

func NewNvidiaNIMAdapter(cfg *config.Config) *NvidiaNIMAdapter {
	return &NvidiaNIMAdapter{apiKey: cfg.NvidiaNIMAPIKey}
}

func (a *NvidiaNIMAdapter) Name() string { return "nvidia_nim" }

func (a *NvidiaNIMAdapter) Dispatch(ctx context.Context, taskType string, payload json.RawMessage) (*NormalizedResponse, error) {
	model, ok := taskModelMap["nvidia_nim"][taskType]
	if !ok {
		model = "meta/llama-3.1-405b-instruct"
	}

	url := nvidiaNIMBaseURL + "/v1/chat/completions"

	reqBody := openAICompatRequest{
		Model: model,
		Messages: []openAICompatMsg{
			{Role: "system", Content: "You are a helpful financial assistant."},
			{Role: "user", Content: string(payload)},
		},
		Temperature: 0.7,
		MaxTokens:   1024,
	}

	bodyBytes, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("nvidia: marshal: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, fmt.Errorf("nvidia: new request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+a.apiKey)

	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("nvidia: request failed: %w", ErrProviderUnavailable)
	}
	defer resp.Body.Close()

	respBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("nvidia: read response: %w", err)
	}

	if resp.StatusCode >= 500 {
		return nil, fmt.Errorf("nvidia: status %d: %w", resp.StatusCode, ErrProviderUnavailable)
	}
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("nvidia: status %d", resp.StatusCode)
	}

	var openAIResp openAICompatResponse
	if err := json.Unmarshal(respBytes, &openAIResp); err != nil {
		return nil, fmt.Errorf("nvidia: unmarshal response: %w", err)
	}

	if len(openAIResp.Choices) == 0 {
		return nil, fmt.Errorf("nvidia: no choices: %w", ErrProviderUnavailable)
	}

	return &NormalizedResponse{Content: openAIResp.Choices[0].Message.Content, Provider: "nvidia_nim"}, nil
}

// ---------------------------------------------------------------------------
// OpenAI
// ---------------------------------------------------------------------------

// OpenAIAdapter adapts the OpenAI API to the Provider interface.
type OpenAIAdapter struct {
	apiKey string
}

func NewOpenAIAdapter(cfg *config.Config) *OpenAIAdapter {
	return &OpenAIAdapter{apiKey: cfg.OpenAIAPIKey}
}

func (a *OpenAIAdapter) Name() string { return "openai" }

func (a *OpenAIAdapter) Dispatch(ctx context.Context, taskType string, payload json.RawMessage) (*NormalizedResponse, error) {
	model, ok := taskModelMap["openai"][taskType]
	if !ok {
		model = "gpt-4o-mini"
	}

	url := openAIBaseURL + "/v1/chat/completions"

	reqBody := openAICompatRequest{
		Model: model,
		Messages: []openAICompatMsg{
			{Role: "system", Content: "You are a helpful financial assistant."},
			{Role: "user", Content: string(payload)},
		},
		Temperature: 0.7,
		MaxTokens:   1024,
	}

	bodyBytes, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("openai: marshal: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, fmt.Errorf("openai: new request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+a.apiKey)

	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("openai: request failed: %w", ErrProviderUnavailable)
	}
	defer resp.Body.Close()

	respBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("openai: read response: %w", err)
	}

	if resp.StatusCode >= 500 {
		return nil, fmt.Errorf("openai: status %d: %w", resp.StatusCode, ErrProviderUnavailable)
	}
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("openai: status %d", resp.StatusCode)
	}

	var openAIResp openAICompatResponse
	if err := json.Unmarshal(respBytes, &openAIResp); err != nil {
		return nil, fmt.Errorf("openai: unmarshal response: %w", err)
	}

	if len(openAIResp.Choices) == 0 {
		return nil, fmt.Errorf("openai: no choices: %w", ErrProviderUnavailable)
	}

	return &NormalizedResponse{Content: openAIResp.Choices[0].Message.Content, Provider: "openai"}, nil
}
