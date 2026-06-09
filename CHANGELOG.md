# Changelog

All notable changes to WiseMoney are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Security

- **Edge — pgx/v5 5.7.4 → 5.9.2** — fixes CVE-2026-33816 (GO-2026-4772, CVSS 9.8),
  a memory-safety vulnerability in the Postgres driver on the auth + rate-limit path
  (also clears GO-2026-4771).
- **Edge — golang.org/x/crypto 0.38.0 → 0.52.0** — clears GO-2025-4134 / GO-2025-4135
  and ~10 related advisories; this library backs argon2 password hashing (FR-AUTH).
- **Edge — go-chi/chi/v5 5.2.1 → 5.2.4** — fixes GO-2025-3770 (host-header injection →
  open redirect in `RedirectSlashes`) and GO-2026-4316.
- **Edge — Go toolchain 1.23 → 1.25.11** — `go.mod` `go 1.25.0` + `toolchain go1.25.11`,
  Dockerfile builder `golang:1.25.11-bookworm`. Clears 51 stdlib advisories.
- **Frontend — vitest ^2.0.5 → ^4.1.8** — fixes GHSA-5xrq-8626-4rwp (CVSS 9.8, dev-time
  test runner).
- **Frontend — vite ^5.4.0 → ^7.3.5** — fixes GHSA-4w7w-66w2-5vf9 (CVSS 6.3, dev server);
  transitively fixes esbuild GHSA-67mh-4wv8-2f99 (CVSS 5.3). Target Vite 7 chosen for
  portfolio alignment (ADR-0010).

### Added

- **Client crypto foundation** — `crypto/envelope.ts` (AES-GCM-256 seal/open, unique
  96-bit IV) and `crypto/keyManagement.ts` (Argon2id master-key derivation via hash-wasm,
  passphrase verification, BYO key seal/open, WebAuthn-PRF master-key wrap/unwrap). Keys
  imported non-extractable, `encrypt`/`decrypt` usages only; raw key bytes zeroed after use
  (INV-KEY-02/03). Dexie schema → **v2** (`keyMeta.wrappedIv`). Mishmar review PASS-WITH-NITS.
- **Edge — consent gate on `POST /v1/ai/proxy`** — `consentSvc.Verify` wired into the
  proxy handler (ARCHITECTURE §10a, INV-EGR-03a). Full-egress requires a valid, unexpired,
  signature-correct assertion bound to the caller's JWT sub, the `X-Feature` header, and
  `level="full"`; any failure forces redacted and the structural cap rejects full-only
  fields with 400. Fail-closed; no payload logged (INV-PROXY-02). 10 gate tests.
- **`X-Feature` request header** — declares the feature a `/v1/ai/proxy` request pertains
  to (ARCHITECTURE §10a). Sibling to `X-Egress-Level` / `X-Consent-Assertion`.
- `GOTOOLCHAIN=local` in the edge Dockerfile builder — hermetic build, no surprise
  toolchain auto-download.

### Fixed

- **`apps/web/tsconfig.json`** — added `allowImportingTsExtensions` + `noEmit` (removed
  `outDir`; Vite handles bundling). The scaffold imports with explicit `.ts`/`.tsx`
  extensions; this clears the project-wide TS5097 errors surfaced by the first typecheck.
- **`apps/web` lint hygiene** — eslint `no-unused-vars` now honors the `^_`
  intentionally-unused convention; 61 stub-file lint errors cleared without implementing
  product logic (async stubs converted to non-async `Promise.reject`, behaviorally identical;
  removed dead imports; dropped one redundant type assertion). `apps/web` now passes
  lint + typecheck + test clean.
- `.github/workflows/security-scan.yml` (GitHub Actions) — osv-scanner v2.3.8 (pinned,
  SHA256-verified) manifest scan + authoritative binary scan; fails on new critical/high.
- `docs/adr/0010-dependency-security-baseline-and-scanning-policy.md` — dependency
  security baseline and scanning policy.
- `docs/adr/0011-mvp-ai-provider-strategy-managed-redacted-byo-key-full-egress.md` —
  MVP provider strategy (T-S0-02 verification outcome).
- `docs/adr/0012-client-auth-session-and-token-storage.md` — client token storage
  decision (resolves SRS OQ-06).
- `docs/runbooks/dependency-scanning.md` — how-to for running the scans.

### Changed

- **AI provider strategy (ADR-0011)** — provider data-handling terms verified
  (2026-06-05). MVP: managed mode = free models (OpenRouter + Gemini-free),
  **redacted-egress only**; full-egress = **BYO-key only**; NVIDIA hosted **dropped**
  (ToS §4.3 prohibits financial data + trains with no opt-out); paid managed deferred.
  ARCHITECTURE §9a/§9b, CONTRACT §8 (MVP-scoping note, INV-EGR-03a unchanged),
  THREAT_MODEL §2.1 + §7 residual updated.
- **Client auth token storage (ADR-0012, resolves OQ-06)** — access JWT held in-memory
  only; refresh token in the AES-GCM-encrypted IndexedDB store (master-key/WebAuthn-gated);
  session coupled to store-unlock; no edge wire change. Adds CONTRACT INV-AUTH-06/07;
  escalates M-EGR-04 (strict CSP/SRI) to a primary MVP control; adds an edge
  refresh-rotation reuse-detection obligation (M-AUTH-05).
- **Frontend** — `@vitejs/plugin-react` ^4.3.1 → ^5.2.0, `vite-plugin-pwa` ^0.20.5 →
  ^1.3.0 (required peers for Vite 7).
- Routing library decision recorded: TanStack Router confirmed (no `react-router`).
