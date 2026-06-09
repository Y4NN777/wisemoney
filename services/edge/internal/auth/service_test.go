package auth

// service_test.go — unit tests for the pure-crypto layer of the auth package.
//
// Scope: hashPassword / verifyPassword / PHC string format / parseArgon2idPHC.
// These tests require NO database and run in the golang container build.
//
// Out of scope (require Postgres — integration test follow-up):
//   - HandleRegister / HandleLogin / HandleRefresh handler logic
//   - Duplicate-email 409 mapping (requires DB with users_email_uq)
//   - Token rotation and reuse-detection (requires DB with refresh_tokens)
//   - Timing equalization for missing users (requires real FindByEmail path)
//
// Integration tests should use testcontainers-go (or a real DB fixture)
// and are tracked as a follow-up task for Joab QA.

import (
	"strings"
	"testing"

	"github.com/y4nn/wisemoney/services/edge/internal/config"
)

// testCfg returns a Config with tight-but-valid Argon2id params for fast tests.
// Production minimums are 64 MiB / 3 iterations; test uses 64 KiB / 1 iteration
// to keep CI fast while still exercising the real code path.
func testCfg() *config.Config {
	return &config.Config{
		Argon2MemoryKiB:   64 * 1024, // 64 MiB — must satisfy config.Load validation
		Argon2Iterations:  3,
		Argon2Parallelism: 2,
	}
}

// testCfgFast uses the absolute minimum params accepted by config.Load.
// Used only in tests that call hashPassword multiple times.
func testCfgFast() *config.Config {
	return &config.Config{
		Argon2MemoryKiB:   64 * 1024,
		Argon2Iterations:  3,
		Argon2Parallelism: 1,
	}
}

// -- hashPassword + verifyPassword round-trip ---------------------------------

func TestHashAndVerify_RoundTrip(t *testing.T) {
	t.Parallel()
	cfg := testCfg()
	password := "correct-horse-battery-staple" // len > minPasswordLen

	encoded, err := hashPassword(password, cfg)
	if err != nil {
		t.Fatalf("hashPassword: unexpected error: %v", err)
	}

	ok, err := verifyPassword(password, encoded)
	if err != nil {
		t.Fatalf("verifyPassword: unexpected error: %v", err)
	}
	if !ok {
		t.Fatal("verifyPassword: expected true for correct password, got false")
	}
}

func TestHashAndVerify_WrongPassword(t *testing.T) {
	t.Parallel()
	cfg := testCfg()

	encoded, err := hashPassword("correct-horse-battery-staple", cfg)
	if err != nil {
		t.Fatalf("hashPassword: unexpected error: %v", err)
	}

	ok, err := verifyPassword("wrong-password-attempt-12345", encoded)
	if err != nil {
		t.Fatalf("verifyPassword: unexpected error: %v", err)
	}
	if ok {
		t.Fatal("verifyPassword: expected false for wrong password, got true")
	}
}

// -- PHC string format assertions ---------------------------------------------

func TestHashPassword_PHCPrefix(t *testing.T) {
	t.Parallel()
	cfg := testCfgFast()

	encoded, err := hashPassword("test-password-phc-format", cfg)
	if err != nil {
		t.Fatalf("hashPassword: unexpected error: %v", err)
	}

	if !strings.HasPrefix(encoded, "$argon2id$v=19$") {
		t.Errorf("PHC string does not start with $argon2id$v=19$: %q", encoded)
	}
}

func TestHashPassword_PHCContainsConfigParams(t *testing.T) {
	t.Parallel()
	cfg := testCfgFast()

	encoded, err := hashPassword("test-password-phc-params", cfg)
	if err != nil {
		t.Fatalf("hashPassword: unexpected error: %v", err)
	}

	// The param segment must encode the exact values from cfg.
	wantM := "m=65536"
	wantT := "t=3"
	wantP := "p=1"
	for _, want := range []string{wantM, wantT, wantP} {
		if !strings.Contains(encoded, want) {
			t.Errorf("PHC string missing %q in %q", want, encoded)
		}
	}
}

func TestHashPassword_PHCSixFields(t *testing.T) {
	t.Parallel()
	cfg := testCfgFast()

	encoded, err := hashPassword("test-password-six-fields", cfg)
	if err != nil {
		t.Fatalf("hashPassword: unexpected error: %v", err)
	}

	// $argon2id$v=19$m=...,t=...,p=...$<salt>$<hash> — split on $ yields 6 parts
	// with the leading empty string from the leading $.
	parts := strings.Split(encoded, "$")
	if len(parts) != 6 {
		t.Errorf("expected 6 $-delimited parts in PHC string, got %d: %q", len(parts), encoded)
	}
}

// -- Random salt: two hashes of the same password must differ -----------------

func TestHashPassword_RandomSalt(t *testing.T) {
	t.Parallel()
	cfg := testCfgFast()
	password := "same-password-different-salts"

	encoded1, err := hashPassword(password, cfg)
	if err != nil {
		t.Fatalf("hashPassword (1): unexpected error: %v", err)
	}
	encoded2, err := hashPassword(password, cfg)
	if err != nil {
		t.Fatalf("hashPassword (2): unexpected error: %v", err)
	}

	if encoded1 == encoded2 {
		t.Error("two hashes of the same password must differ (random salt)")
	}
}

// -- Malformed PHC inputs to verifyPassword -----------------------------------

func TestVerifyPassword_MalformedHash_ReturnsError(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name    string
		encoded string
	}{
		{"empty", ""},
		{"wrong_algorithm", "$argon2i$v=19$m=65536,t=3,p=1$c2FsdA$aGFzaA"},
		{"wrong_version", "$argon2id$v=18$m=65536,t=3,p=1$c2FsdA$aGFzaA"},
		{"too_few_fields", "$argon2id$v=19$m=65536,t=3,p=1$c2FsdA"},
		{"bad_base64_salt", "$argon2id$v=19$m=65536,t=3,p=1$!!!$aGFzaA"},
		{"bad_base64_hash", "$argon2id$v=19$m=65536,t=3,p=1$c2FsdA$!!!"},
		{"zero_memory", "$argon2id$v=19$m=0,t=3,p=1$c2FsdA$aGFzaA"},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			ok, err := verifyPassword("any-password", tc.encoded)
			if err == nil {
				t.Errorf("expected error for malformed hash %q, got ok=%v err=nil", tc.encoded, ok)
			}
			if ok {
				t.Errorf("expected ok=false for malformed hash, got true")
			}
		})
	}
}

// -- Service.dummyPHC: valid, parseable, and carries cfg params ----------------

func TestDummyPHC_Parses(t *testing.T) {
	t.Parallel()
	// Service.dummyPHC must be parseable so HandleLogin's timing-equalization
	// call to verifyPassword does not return an error (which would short-circuit
	// to 500). Also verifies it carries the real cfg params (M-AUTH-03 fix).
	cfg := testCfgFast()
	svc := NewService(cfg, nil, nil)

	memKiB, iters, par, _, _, err := parseArgon2idPHC(svc.dummyPHC)
	if err != nil {
		t.Fatalf("Service.dummyPHC failed to parse: %v", err)
	}
	if memKiB != cfg.Argon2MemoryKiB {
		t.Errorf("dummyPHC m=%d, want %d (cfg param)", memKiB, cfg.Argon2MemoryKiB)
	}
	if iters != cfg.Argon2Iterations {
		t.Errorf("dummyPHC t=%d, want %d (cfg param)", iters, cfg.Argon2Iterations)
	}
	if par != cfg.Argon2Parallelism {
		t.Errorf("dummyPHC p=%d, want %d (cfg param)", par, cfg.Argon2Parallelism)
	}
}

// -- parseArgon2Params upper-bound guards (CWE-20) ----------------------------

func TestParseArgon2Params_RejectsOversizedMemory(t *testing.T) {
	t.Parallel()
	// m > 1 GiB (1<<20 KiB) must be rejected to prevent OOM on verify.
	oversized := "$argon2id$v=19$m=1048577,t=3,p=1$c2FsdHNhbHRzYWx0c2FsdA$aGFzaGhhc2hoYXNoaGFzaA"
	_, err := verifyPassword("any", oversized)
	if err == nil {
		t.Error("expected error for oversized m param, got nil")
	}
}

func TestParseArgon2Params_RejectsOversizedIters(t *testing.T) {
	t.Parallel()
	// t > 64 must be rejected to prevent CPU exhaustion on verify.
	oversized := "$argon2id$v=19$m=65536,t=65,p=1$c2FsdHNhbHRzYWx0c2FsdA$aGFzaGhhc2hoYXNoaGFzaA"
	_, err := verifyPassword("any", oversized)
	if err == nil {
		t.Error("expected error for oversized t param, got nil")
	}
}

func TestParseArgon2Params_AcceptsMaxBoundaryValues(t *testing.T) {
	t.Parallel()
	// Exactly at the upper boundary must succeed (guard is strictly greater-than).
	// Build a valid PHC at the boundary values and verify it parses cleanly.
	salt := make([]byte, 16)
	hash := make([]byte, 32)
	phc := encodeArgon2idPHC(salt, hash, 1<<20, 64, 1)
	_, _, _, _, _, err := parseArgon2idPHC(phc)
	if err != nil {
		t.Errorf("boundary values m=1<<20, t=64 should be accepted, got: %v", err)
	}
}
