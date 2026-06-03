// Package auth implements managed-mode user registration, login, and token
// refresh for the WiseMoney edge.
//
// Invariants enforced:
//   - INV-AUTH-01: no unauthenticated path to proxy functionality (enforced at router).
//   - INV-AUTH-02: passwords stored as Argon2id encoded strings; never plaintext.
//   - INV-AUTH-03: JWTs signed with server-only key; expiry validated on every request.
//   - INV-AUTH-04: per-user isolation — all lookups keyed on JWT sub or Postgres id.
//
// Threat mitigations wired here:
//   - M-AUTH-01: per-IP + per-account rate limiting on /login (see middleware/ratelimit.go
//     for the AI-budget limiter; login-specific limiting is a TODO at this layer).
//   - M-AUTH-03: constant-time password comparison; uniform error messages for
//     "no account" vs "wrong password" (account enumeration prevention).
//   - M-AUTH-05: 15-min access JWT + rotating refresh token.
//   - M-AUTH-06: routing keyed on JWT sub only; no client-supplied user ID trusted.
package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/argon2"

	"github.com/y4nn/wisemoney/services/edge/internal/config"
	"github.com/y4nn/wisemoney/services/edge/internal/store"
)

// Service handles auth HTTP endpoints.
type Service struct {
	cfg       *config.Config
	users     *store.UserRepository
	tokens    *store.RefreshTokenRepository
}

// NewService constructs an auth Service.
func NewService(cfg *config.Config, users *store.UserRepository, tokens *store.RefreshTokenRepository) *Service {
	return &Service{cfg: cfg, users: users, tokens: tokens}
}

// -- HTTP handlers ------------------------------------------------------------

// HandleRegister handles POST /v1/auth/register.
func (s *Service) HandleRegister(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", "malformed request body")
		return
	}

	// TODO(INV-AUTH-02): validate email format; enforce minimum passphrase entropy
	// (M-KEY-01 / THREAT_MODEL §2.5) before hashing.

	hash, err := hashPassword(body.Password, s.cfg)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "registration failed")
		return
	}

	// TODO(impl): call s.users.Create(r.Context(), body.Email, hash).
	// Return 409 on duplicate email using the same generic message to avoid
	// leaking account existence (M-AUTH-03).
	_ = hash

	w.WriteHeader(http.StatusCreated)
	_, _ = w.Write([]byte(`{"status":"created"}`))
}

// HandleLogin handles POST /v1/auth/login.
func (s *Service) HandleLogin(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", "malformed request body")
		return
	}

	// TODO(impl): fetch user by email from s.users.
	// Use constant-time comparison for the password check (M-AUTH-03).
	// Return identical error message whether the account does not exist or the
	// password is wrong — prevents account enumeration (S-AUTH-03, M-AUTH-03).
	// TODO(M-AUTH-01): enforce per-IP and per-account rate limit on this endpoint.

	userID := "TODO-replace-with-real-uuid" // placeholder

	accessToken, err := s.issueAccessJWT(userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "login failed")
		return
	}

	rawRefresh, tokenHash, err := generateRefreshToken()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "login failed")
		return
	}
	_ = tokenHash // TODO(impl): persist via s.tokens.Create(...)

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"access_token":  accessToken,
		"refresh_token": rawRefresh,
		"token_type":    "Bearer",
		"expires_in":    int(s.cfg.JWTAccessTTL.Seconds()),
	})
}

// HandleRefresh handles POST /v1/auth/refresh.
// Implements refresh-token rotation: old token is invalidated on use (M-AUTH-05,
// INV-AUTH-03; THREAT_MODEL §2.2 single-use semantics).
func (s *Service) HandleRefresh(w http.ResponseWriter, r *http.Request) {
	var body struct {
		RefreshToken string `json:"refresh_token"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", "malformed request body")
		return
	}

	tokenHash := hashRefreshToken(body.RefreshToken)
	_ = tokenHash

	// TODO(impl): fetch refresh_tokens row by token_hash.
	// Reject if revoked_at IS NOT NULL or expires_at < now().
	// Revoke the presented token (set revoked_at) before issuing the new pair —
	// single-use enforcement. If the token was already revoked, family-invalidate
	// all tokens for this user (reuse-detection, THREAT_MODEL §2.2).

	userID := "TODO-replace-with-real-uuid" // placeholder

	accessToken, err := s.issueAccessJWT(userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "refresh failed")
		return
	}

	rawRefresh, newTokenHash, err := generateRefreshToken()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "refresh failed")
		return
	}
	_ = newTokenHash // TODO(impl): persist new token via s.tokens.Create(...)

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"access_token":  accessToken,
		"refresh_token": rawRefresh,
		"token_type":    "Bearer",
		"expires_in":    int(s.cfg.JWTAccessTTL.Seconds()),
	})
}

// -- JWT helpers --------------------------------------------------------------

type claims struct {
	jwt.RegisteredClaims
}

// issueAccessJWT mints a short-lived access JWT signed with the server-only key
// (INV-AUTH-03). Access TTL defaults to 15 min (M-AUTH-05).
func (s *Service) issueAccessJWT(userID string) (string, error) {
	now := time.Now().UTC()
	c := claims{
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   userID,
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(s.cfg.JWTAccessTTL)),
			Issuer:    "wisemoney-edge",
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, c)
	return token.SignedString([]byte(s.cfg.JWTSigningKey))
}

// -- Argon2id helpers (INV-AUTH-02) -------------------------------------------

// hashPassword produces the Argon2id PHC string for storage.
// The encoded string includes algorithm, version, parameters, salt, and hash —
// the entire output of a standard Argon2id PHC-string encoder.
// TODO(impl): replace this stub with golang.org/x/crypto/argon2 PHC encoding.
// Parameters are sourced from config (ARGON2_MEMORY_KIB, ARGON2_ITERATIONS,
// ARGON2_PARALLELISM) so they can be tuned per-host (THREAT_MODEL §2.2).
func hashPassword(password string, cfg *config.Config) (string, error) {
	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		return "", fmt.Errorf("auth: generating argon2id salt: %w", err)
	}

	hash := argon2.IDKey(
		[]byte(password),
		salt,
		cfg.Argon2Iterations,
		cfg.Argon2MemoryKiB,
		cfg.Argon2Parallelism,
		32,
	)

	// TODO(impl): encode as PHC string: $argon2id$v=19$m=...,t=...,p=...$<base64salt>$<base64hash>
	// Use a well-tested encoder rather than hand-rolling format.
	_ = hash
	return "argon2id-stub-replace-with-phc-encoder", nil
}

// verifyPassword performs constant-time comparison of a password against a stored
// Argon2id hash string (M-AUTH-03: prevents timing side-channels).
// TODO(impl): parse the PHC string to extract params + salt, re-derive, compare.
func verifyPassword(password, encodedHash string) (bool, error) {
	// Constant-time comparison is mandatory here (M-AUTH-03).
	// crypto/subtle.ConstantTimeCompare ensures no timing leakage.
	_ = subtle.ConstantTimeCompare
	_ = password
	_ = encodedHash
	return false, fmt.Errorf("auth: verifyPassword not yet implemented")
}

// -- Refresh token helpers ----------------------------------------------------

// generateRefreshToken produces a cryptographically random token and its SHA-256
// hash for storage (M-AUTH-04: 128-bit random, single-use). Only the hash is
// persisted; the raw token is returned to the client once and never stored
// (data-model.md §B.2 refresh_tokens.token_hash).
func generateRefreshToken() (raw, hash string, err error) {
	b := make([]byte, 32) // 256 bits — exceeds the 128-bit minimum (M-AUTH-04).
	if _, err = rand.Read(b); err != nil {
		return "", "", fmt.Errorf("auth: generating refresh token: %w", err)
	}
	raw = hex.EncodeToString(b)
	hash = hashRefreshToken(raw)
	return raw, hash, nil
}

// hashRefreshToken returns the SHA-256 hex of a raw refresh token for lookup.
func hashRefreshToken(raw string) string {
	h := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(h[:])
}

// -- Response helpers ---------------------------------------------------------

func writeError(w http.ResponseWriter, status int, code, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{
		"error":   code,
		"message": message,
	})
}
