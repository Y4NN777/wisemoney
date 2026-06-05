# Runbook — Dependency scanning

| Field    | Value                                                                          |
| -------- | ------------------------------------------------------------------------------ |
| Status   | Active (Sprint S0, 2026-06-05)                                                 |
| Diátaxis | How-to                                                                         |
| Date     | 2026-06-05                                                                     |
| Scope    | Installing osv-scanner; scanning Go and pnpm surfaces; binary scan (authoritative Go gate); reading results; known pitfalls |
| Source   | ADR-0010; `/dep-audit` run 2026-06-05; osv-scanner v2.3.8                      |

> Stateful operations in this runbook are written out for the engineer to run.
> No agent executes them. Copy-paste each command exactly.

---

## Preconditions

- You have `curl`, `chmod`, and `sha256sum` (or `shasum -a 256` on macOS) available.
- For the binary scan you have a compiled edge binary (see the build step).
- For the pnpm scan you have the `pnpm-lock.yaml` at the repo root.
- `go.mod` and `go.sum` are present in `services/edge/`.

---

## 1. Install osv-scanner (pinned to v2.3.8)

Pinned version: **v2.3.8**. Do not use `go install` with a floating version.

**Linux x86-64:**
```bash
curl -sSL https://github.com/google/osv-scanner/releases/download/v2.3.8/osv-scanner_linux_amd64 \
  -o /usr/local/bin/osv-scanner
```

**Verify SHA256 before use.** Obtain the expected hash from the release page
(`https://github.com/google/osv-scanner/releases/tag/v2.3.8`, file
`osv-scanner_linux_amd64.sha256`), then run:
```bash
sha256sum /usr/local/bin/osv-scanner
```
Compare the output against the expected hash. If they do not match, delete the
binary and do not proceed.

**Make executable:**
```bash
chmod +x /usr/local/bin/osv-scanner
```

**Confirm version:**
```bash
osv-scanner --version
```
Expected output contains `v2.3.8`.

---

## 2. Scan the Go edge manifest (`services/edge/go.mod`)

This is a manifest scan — a first-pass signal. It reads declared module versions
in `go.mod`. It does **not** read the toolchain version embedded in a compiled
binary. See section 4 for the authoritative binary scan.

```bash
osv-scanner scan --lockfile go:/home/ogu/theY4NN/wisemoney/services/edge/go.mod
```

A clean result looks like:
```
No issues found
```

Any finding is printed as: advisory ID, package, version, severity. Investigate
every CRITICAL or HIGH before proceeding.

---

## 3. Scan the pnpm frontend lockfile (`pnpm-lock.yaml`)

The lockfile is at the repo root (pnpm workspace).

```bash
osv-scanner scan --lockfile /home/ogu/theY4NN/wisemoney/pnpm-lock.yaml
```

A clean result looks like:
```
No issues found
```

All frontend packages are dev/build-time (test runner, dev server, bundler).
CRITICAL and HIGH findings in this surface are supply-chain risks (a compromised
tool running on the developer's machine with access to source and credentials)
and must be treated as real findings, not dismissed as dev-only.

---

## 4. Binary scan — authoritative Go gate

The binary scan reads the Go version and module versions **embedded in the
compiled binary**. This is the authoritative check. It is immune to the
directive-vs-toolchain reporting gap: a `go.mod` manifest can declare `go 1.25.0`
and `toolchain go1.25.11` but still be built with a different toolchain if the
Dockerfile is out of sync. The binary encodes what actually compiled it.

**Step 1 — build the edge binary inside Docker (hermetic):**
```bash
docker build \
  --target builder \
  -t wisemoney-edge-builder:scan \
  /home/ogu/theY4NN/wisemoney/services/edge
```

**Step 2 — extract the binary:**
```bash
docker create --name edge-scan-tmp wisemoney-edge-builder:scan
docker cp edge-scan-tmp:/app/edge /tmp/wisemoney-edge-scan
docker rm edge-scan-tmp
```

**Step 3 — run the binary scan:**
```bash
osv-scanner scan binary /tmp/wisemoney-edge-scan
```

A clean result looks like:
```
No issues found
```

**Step 4 — clean up:**
```bash
rm /tmp/wisemoney-edge-scan
docker rmi wisemoney-edge-builder:scan
```

The binary scan is the gate used in the CI `security:scan` stage. A new CRITICAL
or HIGH finding from the binary scan blocks merge. Manifest-only findings that
are absent from the binary scan indicate a scanner reporting artefact, not a live
vulnerability — document the discrepancy and confirm the binary scan before
closing.

---

## 5. Reading results

| osv-scanner output field | What it means                                                                    |
| ------------------------ | -------------------------------------------------------------------------------- |
| Advisory ID              | OSV id (e.g. `GO-2026-4772`) or GHSA id (e.g. `GHSA-5xrq-8626-4rwp`)           |
| Package                  | Module path and version that is vulnerable                                       |
| CVSS                     | Severity score. CRITICAL = 9.0–10.0; HIGH = 7.0–8.9; MEDIUM = 4.0–6.9          |
| Fixed in                 | The first version that clears the advisory — upgrade to at least this version    |

For each finding:

1. Confirm the advisory ID against OSV.dev (`https://osv.dev/vulnerability/<id>`).
2. Identify the pinned version in the relevant manifest (`go.mod` or `pnpm-lock.yaml`).
3. Upgrade to the minimum fixed version, or higher if a later version is already
   current baseline (do not downgrade to exactly the fixed floor).
4. Re-run the scan to confirm the finding is cleared.
5. Record the advisory ID as a comment inline in the manifest at the pinned line
   (CVE-pin comment convention, harness primitive).

---

## 6. GOTOOLCHAIN=local — why it is set and what to do if it is missing

The edge Dockerfile builder stage sets `GOTOOLCHAIN=local`. This forces the Go
toolchain to use exactly the version installed in the builder image
(`golang:1.25.11-bookworm`). Without it, Go may silently download a different
toolchain version from the network if the `toolchain` directive in `go.mod`
requests one that differs from the builder image.

If you see the builder downloading a toolchain at build time:
```
go: downloading go1.X.Y ...
```
`GOTOOLCHAIN=local` has been removed or overridden. Re-add it to the Dockerfile
builder stage:
```
ENV GOTOOLCHAIN=local
```
Rebuild and re-run the binary scan.

---

## 7. If the manifest scan suddenly re-flags stdlib advisories

**Symptom:** `osv-scanner scan --lockfile go:services/edge/go.mod` reports stdlib
advisories (e.g. `GO-2025-40xx`) that were previously cleared.

**Cause:** The `toolchain go1.25.11` line was stripped from `go.mod`. This happens
when `go mod tidy` is run in an environment where the Go binary version differs
from the declared toolchain. The `go` directive alone (`go 1.25.0`) does not pin
the toolchain binary for scanner purposes.

**The binary was never vulnerable** — the Dockerfile pins `golang:1.25.11-bookworm`
as the builder and sets `GOTOOLCHAIN=local`, so the compiled binary always embeds
the correct version. The manifest scan is reporting against the `go` directive
floor, not the actual build toolchain.

**Fix — re-add the toolchain line:**

Open `services/edge/go.mod` and confirm `go 1.25.0` is present. Add immediately
below it (if absent):
```
toolchain go1.25.11
```

Then confirm the manifest scan is clean again:
```bash
osv-scanner scan --lockfile go:/home/ogu/theY4NN/wisemoney/services/edge/go.mod
```

Add a code review checklist item: any PR touching `go.mod` must confirm the
`toolchain` line is present.

---

## 8. Baseline — versions current as of 2026-06-05

These are the versions the dep-audit cleared. Any scan run against these or higher
must report clean on both surfaces.

**Edge:**
- `github.com/jackc/pgx/v5` — 5.9.2 (clears CVE-2026-33816 / GO-2026-4772, GO-2026-4771)
- `golang.org/x/crypto` — 0.52.0 (clears GO-2025-4134, GO-2025-4135, ~10 others)
- `github.com/go-chi/chi/v5` — 5.2.4 (clears GO-2025-3770, GO-2026-4316)
- `github.com/golang-jwt/jwt/v5` — 5.2.2 (not vulnerable; unchanged)
- Go toolchain — 1.25.11 (clears 51 stdlib advisories GO-2025-40xx…GO-2026-50xx)

**Frontend:**
- `vitest` — ^4.1.8 (clears GHSA-5xrq-8626-4rwp)
- `vite` — ^7.3.5 (clears GHSA-4w7w-66w2-5vf9)
- `esbuild` — cleared transitively via Vite 7 (clears GHSA-67mh-4wv8-2f99)
- `@vitejs/plugin-react` — ^5.2.0
- `vite-plugin-pwa` — ^1.3.0

---

## Verification

After any upgrade or fresh install, run all three scans in order:

```bash
osv-scanner scan --lockfile go:/home/ogu/theY4NN/wisemoney/services/edge/go.mod
osv-scanner scan --lockfile /home/ogu/theY4NN/wisemoney/pnpm-lock.yaml
osv-scanner scan binary /tmp/wisemoney-edge-scan
```

All three must report `No issues found` before the dep-audit is considered closed.

---

*Maintained by Sefer (Jehoshaphat). Source: ADR-0010. Updated when osv-scanner
is re-pinned or baseline versions change.*
