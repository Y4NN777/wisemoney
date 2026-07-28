package provider

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

const (
	geminiBaseURL       = "https://generativelanguage.googleapis.com"
	openRouterBaseURL   = "https://openrouter.ai"
	deepSeekBaseURL     = "https://api.deepseek.com"
	geminiManagedModel  = "gemini-3.6-flash"
	openRouterFreeModel = "openrouter/free"
	deepSeekFlashModel  = "deepseek-v4-flash"
	maxProviderResponse = 2 * 1024 * 1024
)

var httpClient = &http.Client{Timeout: 30 * time.Second}

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

type GeminiAdapter struct {
	apiKey string
}

func NewGeminiAdapter(cfg *config.Config) *GeminiAdapter {
	return &GeminiAdapter{apiKey: cfg.GeminiAPIKey}
}

func (a *GeminiAdapter) Name() string { return "gemini" }

func (a *GeminiAdapter) Dispatch(ctx context.Context, _ string, payload json.RawMessage) (*NormalizedResponse, error) {
	requestBody := geminiRequest{Contents: []geminiContent{{Parts: []geminiPart{{Text: string(payload)}}}}}
	body, err := json.Marshal(requestBody)
	if err != nil {
		return nil, fmt.Errorf("gemini: marshal: %w", err)
	}

	url := geminiBaseURL + "/v1beta/models/" + geminiManagedModel + ":generateContent"
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("gemini: create request: %w", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("x-goog-api-key", a.apiKey)

	response, err := httpClient.Do(request)
	if err != nil {
		return nil, fmt.Errorf("gemini: request: %w", ErrProviderUnavailable)
	}
	defer response.Body.Close()
	responseBody, err := io.ReadAll(io.LimitReader(response.Body, maxProviderResponse+1))
	if err != nil {
		return nil, fmt.Errorf("gemini: read response: %w", ErrProviderUnavailable)
	}
	if len(responseBody) > maxProviderResponse {
		return nil, fmt.Errorf("gemini: response too large: %w", ErrProviderUnavailable)
	}
	if response.StatusCode == http.StatusTooManyRequests || response.StatusCode >= 500 {
		return nil, fmt.Errorf("gemini: status %d: %w", response.StatusCode, ErrProviderUnavailable)
	}
	if response.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("gemini: status %d", response.StatusCode)
	}

	var decoded geminiResponse
	if err := json.Unmarshal(responseBody, &decoded); err != nil || len(decoded.Candidates) == 0 {
		return nil, fmt.Errorf("gemini: invalid response: %w", ErrProviderUnavailable)
	}
	content := ""
	for _, part := range decoded.Candidates[0].Content.Parts {
		content += part.Text
	}
	if content == "" {
		return nil, fmt.Errorf("gemini: empty response: %w", ErrProviderUnavailable)
	}
	return &NormalizedResponse{Content: content, Provider: "gemini"}, nil
}

type chatRequest struct {
	Model       string        `json:"model"`
	Messages    []chatMessage `json:"messages"`
	Temperature float64       `json:"temperature"`
	MaxTokens   int           `json:"max_tokens"`
}

type chatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type chatResponse struct {
	Choices []struct {
		Message chatMessage `json:"message"`
	} `json:"choices"`
}

type OpenRouterAdapter struct {
	apiKey string
}

func NewOpenRouterAdapter(cfg *config.Config) *OpenRouterAdapter {
	return &OpenRouterAdapter{apiKey: cfg.OpenRouterAPIKey}
}

func (a *OpenRouterAdapter) Name() string { return "openrouter" }

func (a *OpenRouterAdapter) Dispatch(ctx context.Context, _ string, payload json.RawMessage) (*NormalizedResponse, error) {
	return dispatchChatProvider(ctx, "openrouter", openRouterBaseURL+"/api/v1/chat/completions", a.apiKey, openRouterFreeModel, payload, map[string]string{
		"HTTP-Referer": "https://wisemoney.y7labs.studio/",
		"X-Title":      "WiseMoney",
	})
}

type DeepSeekAdapter struct {
	apiKey string
}

func NewDeepSeekAdapter(cfg *config.Config) *DeepSeekAdapter {
	return &DeepSeekAdapter{apiKey: cfg.DeepSeekAPIKey}
}

func (a *DeepSeekAdapter) Name() string { return "deepseek" }

func (a *DeepSeekAdapter) Dispatch(ctx context.Context, _ string, payload json.RawMessage) (*NormalizedResponse, error) {
	return dispatchChatProvider(ctx, "deepseek", deepSeekBaseURL+"/chat/completions", a.apiKey, deepSeekFlashModel, payload, nil)
}

func dispatchChatProvider(
	ctx context.Context,
	providerName string,
	endpoint string,
	apiKey string,
	model string,
	payload json.RawMessage,
	extraHeaders map[string]string,
) (*NormalizedResponse, error) {
	body, err := json.Marshal(chatRequest{
		Model: model,
		Messages: []chatMessage{
			{Role: "system", Content: "You are a concise personal-finance assistant."},
			{Role: "user", Content: string(payload)},
		},
		Temperature: 0.3,
		MaxTokens:   1024,
	})
	if err != nil {
		return nil, fmt.Errorf("%s: marshal: %w", providerName, err)
	}

	request, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("%s: create request: %w", providerName, err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Authorization", "Bearer "+apiKey)
	for key, value := range extraHeaders {
		request.Header.Set(key, value)
	}

	response, err := httpClient.Do(request)
	if err != nil {
		return nil, fmt.Errorf("%s: request: %w", providerName, ErrProviderUnavailable)
	}
	defer response.Body.Close()
	responseBody, err := io.ReadAll(io.LimitReader(response.Body, maxProviderResponse+1))
	if err != nil {
		return nil, fmt.Errorf("%s: read response: %w", providerName, ErrProviderUnavailable)
	}
	if len(responseBody) > maxProviderResponse {
		return nil, fmt.Errorf("%s: response too large: %w", providerName, ErrProviderUnavailable)
	}
	if response.StatusCode == http.StatusTooManyRequests || response.StatusCode >= 500 {
		return nil, fmt.Errorf("%s: status %d: %w", providerName, response.StatusCode, ErrProviderUnavailable)
	}
	if response.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("%s: status %d", providerName, response.StatusCode)
	}

	var decoded chatResponse
	if err := json.Unmarshal(responseBody, &decoded); err != nil || len(decoded.Choices) == 0 || decoded.Choices[0].Message.Content == "" {
		return nil, fmt.Errorf("%s: invalid response: %w", providerName, ErrProviderUnavailable)
	}
	return &NormalizedResponse{Content: decoded.Choices[0].Message.Content, Provider: providerName}, nil
}
