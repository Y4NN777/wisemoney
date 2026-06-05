# ADR-0010: Dependency security baseline and scanning policy

| Field      | Value                                                                       |
| ---------- | --------------------------------------------------------------------------- |
| Status     | Accepted                                                                    |
| Date       | 2026-06-03                                                                  |
| Diátaxis   | Explanation                                                                 |
| Source     | Sprint S0 `/dep-audit` (2026-06-03); THREAT_MODEL §2; ADR-0005             |
| Binds      | `services/edge/go.mod`; `apps/web/package.json`; `Dockerfile` (edge builder); CI `security:scan` gate |

## Context

A dependency audit run on 2026-06-03, using osv-scanner v2.3.8, surfaced
critical vulnerabilities across both surfaces of the project at the point of
initial scaffold (Sprint S0, before any install or build had been executed).

**Edge (`services/edge` — Go):**

- `github.com/jackc/pgx/v5` at 5.7.4 carried **CVE-2026-33816** (GO-2026-4772,
  CVSS 9.8) — a memory-safety vulnerability in the Postgres driver — plus
  GO-2026-4771. This library sits on the auth and rate-limit database path
  (FR-AUTH), making it a critical auth-path exposure.
- `golang.org/x/crypto` at 0.38.0 carried **GO-2025-4134** and **GO-2025-4135**
  (CVSS 5.3 each) and approximately ten further advisories. This library backs
  argon2 password hashing (FR-AUTH), meaning the password hashing primitive was
  affected by known advisories.
- `github.com/go-chi/chi/v5` at 5.2.1 carried **GO-2025-3770** (host-header
  injection leading to open redirect in `RedirectSlashes`) plus GO-2026-4316.
- The `go` directive in `go.mod` was pinned to 1.23, and the Dockerfile builder
  image was `golang:1.23-bookworm`. Scanning reported 51 stdlib advisories
  (GO-2025-40xx through GO-2026-50xx) attributable to the Go toolchain version.

**Frontend (`apps/web` — pnpm workspace):**

- `vitest` at ^2.0.5 carried **GHSA-5xrq-8626-4rwp** (CVSS 9.8) — a critical
  vulnerability in the test runner (dev-time only; no production-runtime surface).
- `vite` at ^5.4.0 carried **GHSA-4w7w-66w2-5vf9** (CVSS 6.3) in the dev server.
- `esbuild` at 0.21.5 (transitive via vite 5) carried **GHSA-67mh-4wv8-2f99**
  (CVSS 5.3) in the dev server.

Two 9.8-CVSS vulnerabilities — one in the Postgres driver on the auth path, one
in the test runner — together with a compromised password-hashing library
established that the unmodified scaffold posed an unacceptable residual risk,
even at the pre-build stage.

A secondary problem surfaced: a manifest-only scan (`go.mod` or `pnpm-lock.yaml`)
cannot be trusted as authoritative for the Go toolchain version, because the `go`
directive alone does not pin the toolchain binary — only an explicit `toolchain`
directive in `go.mod` does. A scan of the manifest may report a different toolchain
than what the Dockerfile builder actually uses, creating a reporting gap.

An alignment opportunity also existed: the sibling project AïobiMeet is already
on Vite 7.0.8. Choosing Vite 7 (rather than Vite 6) for the frontend upgrade
reduces cross-project drift while fully clearing the CVEs.

## Decision

**Edge — version pins upgraded:**
- `github.com/jackc/pgx/v5`: 5.7.4 → **5.9.2** (clears CVE-2026-33816 / GO-2026-4772
  and GO-2026-4771).
- `golang.org/x/crypto`: 0.38.0 → **0.52.0** (clears GO-2025-4134, GO-2025-4135,
  and ~10 further advisories).
- `github.com/go-chi/chi/v5`: 5.2.1 → **5.2.4** (clears GO-2025-3770 and
  GO-2026-4316).
- `github.com/golang-jwt/jwt/v5` at 5.2.2 — confirmed not vulnerable; unchanged.

**Edge — toolchain and builder:**
- `go` directive in `go.mod`: 1.23 → **1.25.0**; explicit `toolchain go1.25.11`
  line added to `go.mod`. The toolchain directive makes the manifest's declared
  toolchain unambiguous for scanners and for `go mod tidy`.
- Dockerfile builder image: `golang:1.23-bookworm` → **`golang:1.25.11-bookworm`**
  (pinned; no `:latest`).
- `GOTOOLCHAIN=local` set in the Dockerfile builder stage. This forces the Go
  toolchain to use exactly the version baked into the builder image — it cannot
  silently auto-download a different toolchain version at build time, making the
  build hermetic with respect to toolchain.
- Together, the toolchain upgrade clears 51 stdlib advisories (GO-2025-40xx
  through GO-2026-50xx).

**Frontend — version pins upgraded:**
- `vitest`: ^2.0.5 → **^4.1.8** (clears GHSA-5xrq-8626-4rwp).
- `vite`: ^5.4.0 → **^7.3.5** (clears GHSA-4w7w-66w2-5vf9). Vite 7 chosen over
  Vite 6 for portfolio alignment with AïobiMeet (Vite 7.0.8), reducing
  cross-project drift.
- `esbuild` 0.21.5: cleared transitively via Vite 7 (clears GHSA-67mh-4wv8-2f99).
- `@vitejs/plugin-react`: ^4.3.1 → **^5.2.0** (required peer for Vite 7).
- `vite-plugin-pwa`: ^0.20.5 → **^1.3.0** (required peer for Vite 7).

**Scanning policy — CI gate:**
- Manifest scans (`go.mod` / `pnpm-lock.yaml`) are run as a first-pass signal.
- The **binary scan** (`osv-scanner scan binary ./edge-binary`) is designated
  **authoritative** for the Go surface. It reads the real Go version embedded in
  the compiled binary, bypassing the directive-vs-toolchain reporting gap that
  a manifest-only scan suffers. The CI `security:scan` stage uses the binary
  scan as the gate; a new critical or high finding blocks merge.
- osv-scanner is pinned to **v2.3.8** in CI (GitHub release binary +
  SHA256 verification), not installed via a package manager with a floating range.

**Verification:** osv-scanner v2.3.8 reports "No issues found" on both surfaces
after these pins are applied. Frontend lockfile resolves 529 packages clean; edge
resolves 11 packages clean.

## Consequences

### Positive

- Both 9.8-CVSS vulnerabilities cleared before any install or build is run.
- The argon2 password-hashing library (FR-AUTH) is on a clean advisory baseline.
- The auth-path Postgres driver (FR-AUTH) is on a clean advisory baseline.
- The toolchain directive in `go.mod` makes the declared toolchain explicit and
  scanner-honest — no gap between manifest report and build reality.
- `GOTOOLCHAIN=local` in the Dockerfile builder ensures the toolchain baked into
  the pinned builder image is always the one used; auto-download cannot introduce
  a different version silently.
- The binary-scan gate in CI is immune to the directive-vs-toolchain reporting
  gap: it reads what was actually compiled in, not what the manifest asserts.
- Vite 7 alignment with AïobiMeet reduces the total number of distinct dev-tooling
  versions across the portfolio, narrowing the future upgrade surface.
- All frontend CVEs were dev/build-time; no production-runtime surface was
  affected. The upgrade nonetheless removes them from the security posture
  entirely.

### Negative

- Vite 5 → Vite 7 is a two-major-version jump in dev tooling. Configuration
  changes and potential incompatibilities in plugins or build config must be
  validated before the first build runs.
- The `toolchain` line in `go.mod` can be silently stripped by a careless
  `go mod tidy` run in an environment where the toolchain directive is not
  respected. If this occurs, the manifest reverts to declaring only the `go`
  directive version, and scanners may under-report stdlib advisories relative
  to the actual builder. The Dockerfile pin is the structural backstop.
- Maintaining a pinned osv-scanner binary version in CI adds a periodic
  maintenance task (upgrading the pin when osv-scanner releases security or
  correctness fixes).

### Risks

- **Binary-scan gate not yet wired.** The CI `security:scan` stage is designed
  but not yet implemented (Sprint S0 is pre-pipeline). Until the gate is live,
  the binary scan is a manual step run by the engineer (see runbook). Risk:
  an advisory window exists between now and pipeline wiring.
- **Toolchain-line stripping.** If `go mod tidy` strips the `toolchain` line and
  the change is not caught in review, manifest-only scanners may silently
  under-report stdlib advisories. Mitigation: code review checklist; Dockerfile
  pin is the backstop; the binary scan reads through this regardless.
- **Vite 7 plugin compatibility.** One or more Vite plugins may have
  undocumented breaking changes under Vite 7 not caught by peer-version pins
  alone. Mitigation: validate at first build; pin to patch-stable versions at
  that time.

## Alternatives considered

- **Upgrade to Vite 6 only (not Vite 7).** Would clear the CVEs but miss the
  portfolio-alignment benefit and require another major upgrade in the near term
  when AïobiMeet dependencies converge. Not chosen: the CVE-clearing benefit is
  identical; Vite 7 adds alignment at no additional security cost.
- **Manifest-only scan as authoritative gate.** Rejected: the directive-vs-toolchain
  gap means a manifest-only scan can report a clean Go surface while the compiled
  binary embeds a different, potentially advisory-affected toolchain. The binary
  scan eliminates this gap structurally.
- **Floating toolchain (no `toolchain` directive, rely on Dockerfile only).** Would
  make the Dockerfile the single source of toolchain truth and leave `go.mod`
  ambiguous. Rejected: the `toolchain` directive makes the manifest self-describing
  and allows any scanner operating on the repo (outside a Docker build) to report
  accurately.
- **Accept dev-time CVEs as out-of-scope.** The vitest 9.8 CVSS was dev/build-time.
  Accepted-residual was considered but rejected: a compromised test runner executing
  on a developer's machine has direct access to source, credentials, and environment;
  CVSS 9.8 with no production surface is still a supply-chain attack vector.
