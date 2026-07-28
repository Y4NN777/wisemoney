package provider

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/y4nn/wisemoney/services/edge/internal/config"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (fn roundTripFunc) RoundTrip(request *http.Request) (*http.Response, error) {
	return fn(request)
}

func TestDeepSeekAdapterUsesCurrentChatContract(t *testing.T) {
	previousClient := httpClient
	t.Cleanup(func() { httpClient = previousClient })
	httpClient = &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		if request.URL.String() != "https://api.deepseek.com/chat/completions" {
			t.Fatalf("unexpected URL %s", request.URL)
		}
		if request.Header.Get("Authorization") != "Bearer deepseek-test-key" {
			t.Fatal("missing DeepSeek bearer token")
		}
		var body chatRequest
		if err := json.NewDecoder(request.Body).Decode(&body); err != nil {
			t.Fatal(err)
		}
		if body.Model != deepSeekFlashModel {
			t.Fatalf("got model %q", body.Model)
		}
		return &http.Response{
			StatusCode: http.StatusOK,
			Body:       io.NopCloser(strings.NewReader(`{"choices":[{"message":{"role":"assistant","content":"result"}}]}`)),
			Header:     make(http.Header),
		}, nil
	})}

	adapter := NewDeepSeekAdapter(&config.Config{DeepSeekAPIKey: "deepseek-test-key"})
	response, err := adapter.Dispatch(context.Background(), "reasoning", json.RawMessage(`{"total":1}`))
	if err != nil {
		t.Fatal(err)
	}
	if response.Provider != "deepseek" || response.Content != "result" {
		t.Fatalf("unexpected normalized response: %+v", response)
	}
}

func TestRouterRegistersOnlyConfiguredManagedProviders(t *testing.T) {
	router := NewRouter(&config.Config{DeepSeekAPIKey: "configured"})
	if len(router.providers) != 1 || router.providers["deepseek"] == nil {
		t.Fatalf("unexpected providers: %#v", router.providers)
	}
}
