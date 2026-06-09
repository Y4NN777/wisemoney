// Package auth implements managed-mode user registration, login, and token
// refresh for the WiseMoney edge.
//
// Invariants enforced:
//   - INV-AUTH-01: no unauthenticated path to proxy functionality (enforced at router).
//   - INV-AUTH-02: passwords stored as Argon2id PHC-encoded strings; never plaintext.
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
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"golang.org/x/crypto/argon2"

	"github.com/y4nn/wisemoney/services/edge/internal/config"
	"github.com/y4nn/wisemoney/services/edge/internal/store"
)

// emailRE is a minimal RFC-5321-aligned pattern: local@domain.tld.
// Not exhaustive — rejects the most obvious malformed inputs without
// becoming a validation library. Full validation happens at the DB level
// via the CITEXT column and application-level uniqueness check.
var emailRE = regexp.MustCompile(`^[^@\s]+@[^@\s]+\.[^@\s]+$`)

// minPasswordLen is the minimum acceptable password length (NFR-SEC-05, M-KEY-01).
// This is a floor, not a strength meter — entropy analysis is out of scope here.
const minPasswordLen = 12

// Service handles auth HTTP endpoints.
type Service struct {
	cfg      *config.Config
	users    *store.UserRepository
	tokens   *store.RefreshTokenRepository
	// dummyPHC is a pre-computed PHC string used in HandleLogin when no user is
	// found, so the argon2 derivation cost is paid on both the found and not-found
	// paths (M-AUTH-03 timing equalization).
	//
	// It is hashed with the SAME cfg params (m/t/p) as real passwords — the
	// previous package-level var used t=1/m=64KiB (far cheaper than production
	// m>=64MiB/t>=3), making the not-found path ~100x faster and timing-
	// distinguishable (Joab finding, M-AUTH-03). Using cfg params closes the gap.
	//
	// Computed once at construction via hashPassword so the cost is paid at
	// startup, not per-request. hashPassword only errors on rand.Read failure,
	// which is a fatal OS-level RNG failure; panicking at construction is correct
	// (the server cannot run safely without a working RNG).
	dummyPHC string
}

// NewService constructs an auth Service. It panics if the OS RNG is unavailable
// (rand.Read failure during dummy PHC computation — a fatal startup condition).
func NewService(cfg *config.Config, users *store.UserRepository, tokens *store.RefreshTokenRepository) *Service {
	// Compute dummy PHC with real cfg params so HandleLogin's not-found path
	// pays the same argon2 cost as the found path (M-AUTH-03).
	dummy, err := hashPassword("dummy-password-wisemoney-placeholder", cfg)
	if err != nil {
		// rand.Read failure is an OS-level RNG failure; the server cannot
		// operate safely. Panic is the correct response at construction time.
		panic("auth: NewService: failed to compute dummy PHC (RNG unavailable): " + err.Error())
	}
	return &Service{cfg: cfg, users: users, tokens: tokens, dummyPHC: dummy}
}

// -- HTTP handlers ------------------------------------------------------------

// HandleRegister handles POST /v1/auth/register.
//
// Security note — register enumeration (M-AUTH-03 / Joab flag):
// Registration inherently leaks account existence: a 409 on duplicate email
// tells a probing attacker that the address is registered. This is an accepted
// trade-off documented in THREAT_MODEL §2.3 — the generic error message
// ("account conflict") minimises the signal without pretending the conflict
// didn't occur. A fully opaque registration (e.g. always 201 + out-of-band
// confirmation) is a UX/product decision deferred to Phase 2.
func (s *Service) HandleRegister(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", "malformed request body")
		return
	}

	// Input validation (INV-AUTH-02, NFR-SEC-05).
	if body.Email == "" || !emailRE.MatchString(body.Email) {
		writeError(w, http.StatusBadRequest, "invalid_request", "invalid email address")
		return
	}
	if len(body.Password) < minPasswordLen {
		writeError(w, http.StatusBadRequest, "invalid_request", "password does not meet minimum requirements")
		return
	}

	hash, err := hashPassword(body.Password, s.cfg)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "registration failed")
		return
	}

	_, err = s.users.Create(r.Context(), body.Email, hash)
	if err != nil {
		// Map unique-constraint violation to 409. Use a generic message to avoid
		// confirming the email address is already registered (M-AUTH-03 best effort;
		// see enumeration note on this handler).
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			writeError(w, http.StatusConflict, "conflict", "account conflict")
			return
		}
		writeError(w, http.StatusInternalServerError, "internal_error", "registration failed")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_, _ = w.Write([]byte(`{"status":"created"}`))
}

// HandleLogin handles POST /v1/auth/login.
//
// Timing equalization (M-AUTH-03): when the email is not found, verifyPassword
// is called against dummyPHC so the argon2 cost is paid on both the found and
// not-found paths. The result is discarded; the 401 is returned regardless.
//
// TODO(M-AUTH-01): enforce per-IP and per-account rate limit on this endpoint.
// The global token-bucket in middleware/ratelimit.go is not login-specific;
// a dedicated login rate-limiter (e.g. 5 attempts / 15 min per IP) is required
// before production exposure.
func (s *Service) HandleLogin(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", "malformed request body")
		return
	}

	user, err := s.users.FindByEmail(r.Context(), body.Email)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "login failed")
		return
	}

	// Equalize timing: always pay the argon2 cost regardless of account existence.
	// s.dummyPHC is computed with the same cfg params as real passwords (M-AUTH-03).
	hashToCheck := s.dummyPHC
	if user != nil {
		hashToCheck = user.PasswordHash
	}

	ok, err := verifyPassword(body.Password, hashToCheck)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "login failed")
		return
	}

	// Uniform 401 for both "no account" and "wrong password" (M-AUTH-03).
	if user == nil || !ok {
		writeError(w, http.StatusUnauthorized, "invalid_credentials", "invalid credentials")
		return
	}

	accessToken, err := s.issueAccessJWT(user.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "login failed")
		return
	}

	rawRefresh, tokenHash, err := generateRefreshToken()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "login failed")
		return
	}

	_, err = s.tokens.Create(r.Context(), user.ID, tokenHash, time.Now().UTC().Add(s.cfg.JWTRefreshTTL))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "login failed")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"access_token":  accessToken,
		"refresh_token": rawRefresh,
		"token_type":    "Bearer",
		"expires_in":    int(s.cfg.JWTAccessTTL.Seconds()),
	})
}

// HandleRefresh handles POST /v1/auth/refresh.
//
// Rotation semantics (M-AUTH-05, INV-AUTH-03, THREAT_MODEL §2.2):
//   - Presented token is revoked before the new pair is issued.
//   - If the token is already revoked (reuse detected), the entire token family
//     for the user is invalidated (RevokeAllForUser) before returning 401.
//
// Transaction limitation: the repos expose *pgxpool.Pool directly with no
// tx-accepting variant. Revoke + Create are therefore two sequential pool
// operations, not a single atomic transaction. The gap between them is:
//
//   - After Revoke succeeds, before Create succeeds: the old token is gone and
//     no new token exists. A crash here leaves the user logged out with no valid
//     refresh token; they must re-authenticate. This is the safe failure mode
//     (no token reuse possible).
//   - The Create failure path returns 500; the client should retry with fresh
//     credentials (re-login). This is documented here and flagged for Joab.
//
// To eliminate this gap, the repos would need a pgx.Tx variant (e.g.
// CreateTx(ctx, tx, ...) and RevokeTx(ctx, tx, id)). Surfaced as a follow-up
// for Zerubbabel / Shallum; see TODO below.
//
// TODO(tx-safety): introduce pgx.Tx variants on RefreshTokenRepository.Revoke
// and RefreshTokenRepository.Create so HandleRefresh can wrap both in a single
// BEGIN/COMMIT (atomic rotation). Track as a Zerubbabel/Shallum follow-up.
//
// Additionally, the non-transactional Revoke→Create sequence permits a
// concurrent double-issuance race: two simultaneous refresh requests carrying
// the same token can each pass the FindByTokenHash+RevokedAt check before
// either Revoke call completes, causing both to issue a new valid token. The
// tx fix above eliminates this race (only the first committer wins the unique
// constraint on the new token hash; the second sees a conflict or a now-revoked
// presented token). Until the tx fix lands, the window is narrow (network RTT)
// and the reuse-detection path provides a backstop for the second use.
func (s *Service) HandleRefresh(w http.ResponseWriter, r *http.Request) {
	var body struct {
		RefreshToken string `json:"refresh_token"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", "malformed request body")
		return
	}

	if body.RefreshToken == "" {
		writeError(w, http.StatusBadRequest, "invalid_request", "refresh_token is required")
		return
	}

	tokenHash := hashRefreshToken(body.RefreshToken)

	found, err := s.tokens.FindByTokenHash(r.Context(), tokenHash)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "refresh failed")
		return
	}
	if found == nil {
		// Unknown token — not in the table (or already purged).
		writeError(w, http.StatusUnauthorized, "invalid_token", "invalid or expired token")
		return
	}

	// Reuse detection (THREAT_MODEL §2.2): token was already revoked.
	// Invalidate the entire family and return 401 — the account may be compromised.
	if found.RevokedAt != nil {
		_ = s.tokens.RevokeAllForUser(r.Context(), found.UserID)
		writeError(w, http.StatusUnauthorized, "invalid_token", "invalid or expired token")
		return
	}

	// Expiry check.
	if found.ExpiresAt.Before(time.Now().UTC()) {
		writeError(w, http.StatusUnauthorized, "invalid_token", "invalid or expired token")
		return
	}

	// Confirm the user still exists (INV-AUTH-03).
	user, err := s.users.FindByID(r.Context(), found.UserID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "refresh failed")
		return
	}
	if user == nil {
		// User was deleted; invalidate remaining tokens and return 401.
		_ = s.tokens.RevokeAllForUser(r.Context(), found.UserID)
		writeError(w, http.StatusUnauthorized, "invalid_token", "invalid or expired token")
		return
	}

	// Rotate: revoke presented token, then create replacement.
	// See transaction limitation comment on this handler above.
	if err := s.tokens.Revoke(r.Context(), found.ID); err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "refresh failed")
		return
	}

	rawRefresh, newTokenHash, err := generateRefreshToken()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "refresh failed")
		return
	}

	_, err = s.tokens.Create(r.Context(), user.ID, newTokenHash, time.Now().UTC().Add(s.cfg.JWTRefreshTTL))
	if err != nil {
		// Old token is already revoked; client must re-authenticate (safe failure).
		writeError(w, http.StatusInternalServerError, "internal_error", "refresh failed")
		return
	}

	accessToken, err := s.issueAccessJWT(user.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "refresh failed")
		return
	}

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
//
// PHC format (https://github.com/P-H-C/phc-string-format/blob/master/phc-sf-spec.md):
//
//	$argon2id$v=19$m=<memKiB>,t=<iters>,p=<par>$<base64-salt>$<base64-hash>
//
// Both salt and hash are encoded with base64.RawStdEncoding (no padding),
// per the PHC specification. Hand-rolled encoding is used rather than a
// third-party library (no new dep; format is well-specified and trivially
// testable; any deviation is caught by the round-trip test in service_test.go).
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

	return encodeArgon2idPHC(salt, hash, cfg.Argon2MemoryKiB, cfg.Argon2Iterations, cfg.Argon2Parallelism), nil
}

// encodeArgon2idPHC encodes salt and hash bytes into the Argon2id PHC string.
// Extracted so the dummyPHC initialiser and hashPassword share one implementation.
func encodeArgon2idPHC(salt, hash []byte, memKiB, iters uint32, par uint8) string {
	b64Salt := base64.RawStdEncoding.EncodeToString(salt)
	b64Hash := base64.RawStdEncoding.EncodeToString(hash)
	return fmt.Sprintf(
		"$argon2id$v=19$m=%d,t=%d,p=%d$%s$%s",
		memKiB, iters, par, b64Salt, b64Hash,
	)
}

// verifyPassword parses an Argon2id PHC string, re-derives the hash with the
// stored parameters and salt, and compares the result in constant time (M-AUTH-03).
//
// Returns:
//   - (true, nil)  — password matches
//   - (false, nil) — password does not match (not an error)
//   - (false, err) — PHC string is malformed (caller should return 500)
func verifyPassword(password, encodedHash string) (bool, error) {
	memKiB, iters, par, salt, storedHash, err := parseArgon2idPHC(encodedHash)
	if err != nil {
		return false, fmt.Errorf("auth: verifyPassword: %w", err)
	}

	derived := argon2.IDKey([]byte(password), salt, iters, memKiB, par, uint32(len(storedHash)))

	// Constant-time comparison (M-AUTH-03): no early exit on mismatch.
	if subtle.ConstantTimeCompare(derived, storedHash) == 1 {
		return true, nil
	}
	return false, nil
}

// parseArgon2idPHC parses a PHC-encoded Argon2id string.
//
// Expected format: $argon2id$v=19$m=<memKiB>,t=<iters>,p=<par>$<b64salt>$<b64hash>
// Returns an error for any deviation from this format.
func parseArgon2idPHC(encoded string) (memKiB, iters uint32, par uint8, salt, hash []byte, err error) {
	// Split on $ — expected parts: ["", "argon2id", "v=19", "m=...,t=...,p=...", "<salt>", "<hash>"]
	parts := strings.Split(encoded, "$")
	if len(parts) != 6 {
		return 0, 0, 0, nil, nil, errors.New("invalid PHC string: wrong number of fields")
	}
	if parts[1] != "argon2id" {
		return 0, 0, 0, nil, nil, fmt.Errorf("invalid PHC string: unsupported algorithm %q", parts[1])
	}
	if parts[2] != "v=19" {
		return 0, 0, 0, nil, nil, fmt.Errorf("invalid PHC string: unsupported version %q", parts[2])
	}

	// Parse m=<memKiB>,t=<iters>,p=<par>
	memKiB, iters, par, err = parseArgon2Params(parts[3])
	if err != nil {
		return 0, 0, 0, nil, nil, err
	}

	salt, err = base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil {
		return 0, 0, 0, nil, nil, fmt.Errorf("invalid PHC string: bad salt encoding: %w", err)
	}

	hash, err = base64.RawStdEncoding.DecodeString(parts[5])
	if err != nil {
		return 0, 0, 0, nil, nil, fmt.Errorf("invalid PHC string: bad hash encoding: %w", err)
	}

	return memKiB, iters, par, salt, hash, nil
}

// parseArgon2Params parses the param segment "m=<memKiB>,t=<iters>,p=<par>".
func parseArgon2Params(params string) (memKiB, iters uint32, par uint8, err error) {
	for _, kv := range strings.Split(params, ",") {
		pair := strings.SplitN(kv, "=", 2)
		if len(pair) != 2 {
			return 0, 0, 0, fmt.Errorf("invalid PHC params segment %q", kv)
		}
		v, parseErr := strconv.ParseUint(pair[1], 10, 64)
		if parseErr != nil {
			return 0, 0, 0, fmt.Errorf("invalid PHC param %q: %w", kv, parseErr)
		}
		switch pair[0] {
		case "m":
			memKiB = uint32(v)
		case "t":
			iters = uint32(v)
		case "p":
			par = uint8(v)
		default:
			return 0, 0, 0, fmt.Errorf("unknown PHC param key %q", pair[0])
		}
	}
	if memKiB == 0 || iters == 0 || par == 0 {
		return 0, 0, 0, errors.New("invalid PHC params: m, t, and p must all be non-zero")
	}
	// Upper-bound guards (CWE-20): reject pathological stored params that would
	// trigger OOM or CPU exhaustion on verify. Limits are deliberately generous
	// (1 GiB memory, 64 iterations) — far above any reasonable production value —
	// so they only catch malformed or maliciously crafted PHC strings.
	const maxMemKiB = 1 << 20 // 1 GiB
	const maxIters  = 64
	if memKiB > maxMemKiB {
		return 0, 0, 0, fmt.Errorf("invalid PHC params: m=%d exceeds maximum %d KiB", memKiB, maxMemKiB)
	}
	if iters > maxIters {
		return 0, 0, 0, fmt.Errorf("invalid PHC params: t=%d exceeds maximum %d", iters, maxIters)
	}
	return memKiB, iters, par, nil
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
