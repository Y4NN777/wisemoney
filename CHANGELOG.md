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

- `GOTOOLCHAIN=local` in the edge Dockerfile builder — hermetic build, no surprise
  toolchain auto-download.
- `.gitlab-ci.yml` `security:scan` stage — osv-scanner v2.3.8 (pinned, SHA256-verified)
  manifest scan + authoritative binary scan; fails on new critical/high.
- `docs/adr/0010-dependency-security-baseline-and-scanning-policy.md` — dependency
  security baseline and scanning policy.
- `docs/runbooks/dependency-scanning.md` — how-to for running the scans.

### Changed

- **Frontend** — `@vitejs/plugin-react` ^4.3.1 → ^5.2.0, `vite-plugin-pwa` ^0.20.5 →
  ^1.3.0 (required peers for Vite 7).
- Routing library decision recorded: TanStack Router confirmed (no `react-router`).
