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
- **Dashboard and financial history** — current balances, monthly activity,
  period comparisons, transaction filtering, adaptive first-use guidance, and
  deterministic event-sourced projections.
- **Planning tools** — budgets, savings goals, recurring items, one-off planned
  expenses, and debt/receivable tracking with optional due dates.
- **Local reminders and calendars** — weekly reviews, due-date and budget
  reminders, privacy-preserving notification content, and bilingual calendar
  exports without financial amounts.
- **Backups and financial cycles** — lossless encrypted backup and restore,
  CSV/XLSX exports, readable cycle statements, and guarded cycle closure.
- **Financial guidance** — a bilingual offline help guide, WiseBot product help,
  financial-literacy explanations, and a separately consented Financial
  Assistant with managed and bring-your-own-key provider modes.
- **Installable web application** — responsive phone and desktop layouts,
  offline navigation, install guidance, and a custom service worker preserving
  the encrypted local-first model.
- **Public release notes** — a bilingual `/updates` page available before vault
  unlock, with user-facing highlights and links to the corresponding GitHub
  release.

### Changed

- **Simpler information architecture** — Capture focuses on entering money,
  Planning groups forward-looking work, Settings progressively discloses
  advanced controls, and WiseBot uses a focused mobile conversation.
- **Clearer financial language** — balances, received/spent values, movements,
  consent boundaries, offline behavior, and reminder reliability use direct
  French and English wording intended for non-technical users.
- **Production defaults** — new vaults default to XOF while forms and summaries
  respect the selected account or base currency.
- **Public documentation** — project, security, architecture, threat-model, and
  operational runbooks reflect the first production baseline.

### Fixed

- **Visible update lifecycle** — deployed versions are checked on launch,
  foreground, reconnect, and at a short interval; the user can install now or
  later, sees installation progress, and receives confirmation after reload.
- **Mobile experience** — reduced-motion indicators stop correctly, WiseBot fits
  phone safe areas, forms stay constrained, and dropdowns remain stable inside
  dialogs.
- **Projection integrity** — event replay, period boundaries, archived entities,
  recurring anchors, transaction changes, category totals, transfers, currency
  conversion, and safe-integer arithmetic are deterministic and validated.
- **Concurrency and recovery** — stale journal writes are rejected, cross-tab
  changes invalidate affected queries, imports restore atomically, and failed
  operations preserve prior vault metadata.
- **Help presentation** — the search field now uses the shared WiseMoney input
  treatment and privacy/offline explanations avoid ambiguous consent or
  implementation jargon.

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
  OSV scanning, production builds, and current patched Go and JavaScript
  dependency lines form required release gates.

[1.0.0]: https://github.com/Y4NN777/wisemoney/releases/tag/v1.0.0
