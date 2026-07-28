package config

import (
	"strings"
	"testing"
)

func setValidEnvironment(t *testing.T) {
	t.Helper()
	t.Setenv("DATABASE_URL", "postgres://user:pass@localhost/wisemoney")
	t.Setenv("EDGE_PORT", "8080")
	t.Setenv("JWT_SIGNING_KEY", strings.Repeat("k", 32))
	t.Setenv("JWT_ACCESS_TTL", "15m")
	t.Setenv("JWT_REFRESH_TTL", "720h")
	t.Setenv("ARGON2_MEMORY_KIB", "65536")
	t.Setenv("ARGON2_ITERATIONS", "3")
	t.Setenv("ARGON2_PARALLELISM", "2")
	t.Setenv("RATE_LIMIT_RPS", "2")
	t.Setenv("RATE_LIMIT_BURST", "10")
	t.Setenv("TRUST_PROXY_HEADERS", "false")
}

func TestLoadRejectsUnsafeDurationsAndParallelism(t *testing.T) {
	tests := []struct {
		name    string
		key     string
		value   string
		message string
	}{
		{name: "zero access ttl", key: "JWT_ACCESS_TTL", value: "0s", message: "JWT_ACCESS_TTL must be greater than zero"},
		{name: "negative refresh ttl", key: "JWT_REFRESH_TTL", value: "-1h", message: "JWT_REFRESH_TTL must be greater than zero"},
		{name: "refresh shorter than access", key: "JWT_REFRESH_TTL", value: "5m", message: "JWT_REFRESH_TTL must be greater"},
		{name: "zero argon parallelism", key: "ARGON2_PARALLELISM", value: "0", message: "ARGON2_PARALLELISM must be greater than zero"},
		{name: "invalid proxy boolean", key: "TRUST_PROXY_HEADERS", value: "sometimes", message: "TRUST_PROXY_HEADERS: invalid boolean"},
		{name: "invalid edge port", key: "EDGE_PORT", value: "70000", message: "EDGE_PORT must be an integer between 1 and 65535"},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			setValidEnvironment(t)
			t.Setenv(test.key, test.value)
			_, err := Load()
			if err == nil || !strings.Contains(err.Error(), test.message) {
				t.Fatalf("expected %q, got %v", test.message, err)
			}
		})
	}
}

func TestLoadAcceptsValidatedDefaults(t *testing.T) {
	setValidEnvironment(t)
	config, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if config.Argon2Parallelism != 2 || config.JWTRefreshTTL <= config.JWTAccessTTL {
		t.Fatalf("unexpected config: %+v", config)
	}
}
