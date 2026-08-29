# Changelog

All notable changes to WiseMoney are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-08-17

WiseMoney 1.0.0 is the first official release. It establishes the complete
local-first personal-finance product; this version is not an incremental update
from an earlier public release.

### Added

- **Private financial workspace** — encrypted local vault, passphrase and
  supported-device unlock, explicit lock action, encrypted settings, and
  session-bound query state.
- **Daily money management** — accounts, income and expense transactions,
  transfers, editing, deletion, category management, multi-currency display,
  and locally managed exchange rates.
- **Dashboard and financial history** — current and per-account balances,
  monthly activity, period comparisons, balance and cash-flow trends, category
  breakdowns, controllable alerts, adaptive first-use guidance, and a unified,
  searchable view of all financial operations.
- **Planning tools** — budgets, savings goals, recurring items, one-off planned
  expenses, and debt/receivable tracking with optional due dates.
- **Local reminders and calendars** — weekly reviews, due-date and budget
  reminders, privacy-preserving notification content, and bilingual calendar
  exports without financial amounts.
- **Backups and financial cycles** — lossless encrypted backup and restore,
  CSV/XLSX exports, readable cycle statements, and guarded cycle closure.
- **Financial guidance** — a versioned bilingual task guide shared by written
  help and WiseBot, precise follow-up context, deterministic offline answers,
  quiet local coaching with optional silent notifications, understandable error
  recovery, financial-literacy explanations, and a separately consented
  Financial Assistant with managed and bring-your-own-key provider modes.
- **Installable web application** — responsive phone and desktop layouts,
  offline navigation, install guidance, and a custom service worker preserving
  the encrypted local-first model.
- **Public release notes** — a bilingual `/updates` page available before vault
  unlock, with user-facing highlights and links to the corresponding GitHub
  release.

### Changed

- **Clearer first visit** — the landing page now leads with a short,
  benefit-focused promise and communicates tracking, planning, and protection
  through a compact visual overview instead of explanatory paragraphs.
- **Simpler information architecture** — Capture focuses on entering money,
  Planning groups forward-looking work, Settings progressively discloses
  advanced controls, and WiseBot uses a focused mobile conversation.
- **Calmer visual system** — semantic status colors replace saturated red and
  green treatments, while light, dark, and device-controlled themes share the
  same restrained dashboard hierarchy.
- **Clearer financial language** — balances, received/spent values, movements,
  consent boundaries, offline behavior, and reminder reliability use direct
  French and English wording intended for non-technical users.
- **Production defaults** — new vaults default to XOF while forms and summaries
  respect the selected account or base currency.
- **Public documentation** — project, security, architecture, threat-model, and
  operational runbooks reflect the first production baseline.

### Fixed

- **Theme and mobile navigation consistency** — the public landing page now
  uses a dark-specific grid and wash instead of leaking light-theme gradients,
  primary actions keep the WiseMoney blue in both themes, and the French bottom
  navigation uses the compact “Accueil” label without shortening page titles.
  Language controls also keep the brand blue, while the mobile unlock header
  uses a compact selector and an arrow-only back action without repeating the
  logo above the form.
- **Visible update lifecycle** — deployed versions are checked on launch,
  foreground, reconnect, and at a short interval; the user can install now or
  later, sees installation progress, and receives confirmation after reload.
- **Mobile experience** — reduced-motion indicators stop correctly, WiseBot fits
  phone safe areas, forms stay constrained, and dropdowns remain stable inside
  dialogs.
- **Projection integrity** — event replay, period boundaries, archived entities,
  recurring anchors, transaction changes, category totals, transfers, currency
  conversion, recurring-realisation deduplication, and safe-integer arithmetic
  are deterministic and validated.
- **Concurrency and recovery** — stale journal writes are rejected, cross-tab
  changes invalidate affected queries, imports restore atomically, and failed
  operations preserve prior vault metadata.
- **Help presentation** — the search field now uses the shared WiseMoney input
  treatment and privacy/offline explanations avoid ambiguous consent or
  implementation jargon. WiseBot uses the complete canonical guide, retains
  the selected topic across follow-up questions, requests exact procedural
  steps, and safely renders lists and emphasis.
- **Local projection recovery** — a damaged or unreadable cached projection no
  longer blocks the dashboard or Planning; WiseMoney rebuilds it from the
  encrypted event journal and offers calm retry, reopen, local diagnostic, and
  WiseBot explanation actions if a screen still cannot load.

### Security

- **Encrypted client data** — AES-GCM envelopes, Argon2id derivation,
  non-extractable keys, WebAuthn PRF wrapping, and short-lived plaintext buffers
  protect financial data stored on the device.
- **Controlled AI egress** — managed requests accept only aggregate financial
  context, full context is limited to explicit BYO-key use, browser requests are
  bounded, and help-assistant processing remains isolated from the vault.
- **Managed edge hardening** — rotating refresh tokens, strict JWT and request
  validation, bounded provider attempts, trusted-proxy handling, rate limits,
  body limits, and hardened database and Go dependencies.
- **Supply-chain baseline** — pinned CI actions, frozen dependency installation,
  OSV scanning, production builds, Go 1.25.13 with the August 2026 standard
  library security fixes, and Nano ID 3.3.18 form required release gates.

[1.0.0]: https://github.com/Y4NN777/wisemoney/releases/tag/v1.0.0
