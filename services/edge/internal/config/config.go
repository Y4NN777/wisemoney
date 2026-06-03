// Package config loads edge configuration from environment variables.
// All secrets (JWT signing key, provider keys, DB credentials) are injected at
// runtime — never committed to version control (MISHKAN standard, SOPS/age).
package config

import (
	"errors"
	"fmt"
	"os"
	"strconv"
	"time"
)

// Config holds the typed, validated configuration for the edge process.
// Field names map 1:1 to .env.example keys.
type Config struct {
	// Port the HTTP server listens on (EDGE_PORT; default 8080).
	Port string

	// DatabaseURL is the pgx DSN pointing to the auth-only Postgres instance.
	// The edge Postgres holds ONLY users + refresh_tokens — NO financial data
	// (INV-PROXY-01, Gate-4 decision 20).
	DatabaseURL string

	// JWT parameters (INV-AUTH-03).
	// JWTSigningKey is server-only; never transmitted to any client.
	JWTSigningKey string
	JWTAccessTTL  time.Duration
	JWTRefreshTTL time.Duration

	// Consent-assertion signing (AQ-01; ARCHITECTURE §10a "Consent-assertion contract").
	// A DEDICATED key, separate from JWTSigningKey, so the consent and auth keys
	// rotate independently (Gate-5). Server-only; never sent to a client.
	ConsentSigningKey   string
	ConsentAssertionTTL time.Duration

	// Argon2id KDF parameters (INV-AUTH-02).
	// Minimum: memory >= 64 MiB (65536 KiB), iterations >= 3 (THREAT_MODEL §2.2).
	Argon2MemoryKiB  uint32
	Argon2Iterations uint32
	Argon2Parallelism uint8

	// Rate-limit token bucket (in-memory, Gate-4 #20).
	// Redis is the documented scale-out path (ARCHITECTURE §11).
	RateLimitRPS   float64
	RateLimitBurst int

	// Managed-mode AI provider keys (server-side only; INV-KEY-01).
	// Never transmitted to the client.
	GeminiAPIKey    string
	NvidiaNIMAPIKey string
	OpenAIAPIKey    string
}

// Load reads and validates configuration from environment variables.
// Returns an error if any required variable is absent or malformed.
func Load() (*Config, error) {
	var errs []error

	port := envOr("EDGE_PORT", "8080")

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		errs = append(errs, errors.New("DATABASE_URL is required"))
	}

	jwtKey := os.Getenv("JWT_SIGNING_KEY")
	if jwtKey == "" {
		errs = append(errs, errors.New("JWT_SIGNING_KEY is required"))
	}
	if len(jwtKey) < 32 {
		errs = append(errs, errors.New("JWT_SIGNING_KEY must be at least 32 bytes"))
	}

	accessTTL, err := parseDuration("JWT_ACCESS_TTL", "15m")
	if err != nil {
		errs = append(errs, err)
	}
	refreshTTL, err := parseDuration("JWT_REFRESH_TTL", "720h")
	if err != nil {
		errs = append(errs, err)
	}

	consentKey := os.Getenv("CONSENT_SIGNING_KEY")
	if consentKey == "" {
		errs = append(errs, errors.New("CONSENT_SIGNING_KEY is required"))
	}
	if len(consentKey) < 32 {
		errs = append(errs, errors.New("CONSENT_SIGNING_KEY must be at least 32 bytes"))
	}
	if consentKey != "" && consentKey == jwtKey {
		errs = append(errs, errors.New("CONSENT_SIGNING_KEY must differ from JWT_SIGNING_KEY (independent rotation)"))
	}
	consentTTL, err := parseDuration("CONSENT_ASSERTION_TTL", "5m")
	if err != nil {
		errs = append(errs, err)
	}

	memKiB, err := parseUint32("ARGON2_MEMORY_KIB", 65536)
	if err != nil {
		errs = append(errs, err)
	}
	if memKiB < 65536 {
		errs = append(errs, errors.New("ARGON2_MEMORY_KIB must be >= 65536 (64 MiB) per THREAT_MODEL §2.2"))
	}

	iters, err := parseUint32("ARGON2_ITERATIONS", 3)
	if err != nil {
		errs = append(errs, err)
	}
	if iters < 3 {
		errs = append(errs, errors.New("ARGON2_ITERATIONS must be >= 3 per THREAT_MODEL §2.2"))
	}

	parallelism, err := parseUint8("ARGON2_PARALLELISM", 2)
	if err != nil {
		errs = append(errs, err)
	}

	rlRPS, err := parseFloat64("RATE_LIMIT_RPS", 2.0)
	if err != nil {
		errs = append(errs, err)
	}
	rlBurst, err := parseInt("RATE_LIMIT_BURST", 10)
	if err != nil {
		errs = append(errs, err)
	}

	if len(errs) > 0 {
		return nil, errors.Join(errs...)
	}

	return &Config{
		Port:              port,
		DatabaseURL:       dbURL,
		JWTSigningKey:       jwtKey,
		JWTAccessTTL:        accessTTL,
		JWTRefreshTTL:       refreshTTL,
		ConsentSigningKey:   consentKey,
		ConsentAssertionTTL: consentTTL,
		Argon2MemoryKiB:   memKiB,
		Argon2Iterations:  iters,
		Argon2Parallelism: parallelism,
		RateLimitRPS:      rlRPS,
		RateLimitBurst:    rlBurst,
		GeminiAPIKey:      os.Getenv("GEMINI_API_KEY"),
		NvidiaNIMAPIKey:   os.Getenv("NVIDIA_NIM_API_KEY"),
		OpenAIAPIKey:      os.Getenv("OPENAI_API_KEY"),
	}, nil
}

// -- helpers ------------------------------------------------------------------

func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func parseDuration(key, def string) (time.Duration, error) {
	s := envOr(key, def)
	d, err := time.ParseDuration(s)
	if err != nil {
		return 0, fmt.Errorf("%s: invalid duration %q: %w", key, s, err)
	}
	return d, nil
}

func parseUint32(key string, def uint32) (uint32, error) {
	s := os.Getenv(key)
	if s == "" {
		return def, nil
	}
	v, err := strconv.ParseUint(s, 10, 32)
	if err != nil {
		return 0, fmt.Errorf("%s: invalid uint32 %q: %w", key, s, err)
	}
	return uint32(v), nil
}

func parseUint8(key string, def uint8) (uint8, error) {
	s := os.Getenv(key)
	if s == "" {
		return def, nil
	}
	v, err := strconv.ParseUint(s, 10, 8)
	if err != nil {
		return 0, fmt.Errorf("%s: invalid uint8 %q: %w", key, s, err)
	}
	return uint8(v), nil
}

func parseFloat64(key string, def float64) (float64, error) {
	s := os.Getenv(key)
	if s == "" {
		return def, nil
	}
	v, err := strconv.ParseFloat(s, 64)
	if err != nil {
		return 0, fmt.Errorf("%s: invalid float64 %q: %w", key, s, err)
	}
	return v, nil
}

func parseInt(key string, def int) (int, error) {
	s := os.Getenv(key)
	if s == "" {
		return def, nil
	}
	v, err := strconv.Atoi(s)
	if err != nil {
		return 0, fmt.Errorf("%s: invalid int %q: %w", key, s, err)
	}
	return v, nil
}
