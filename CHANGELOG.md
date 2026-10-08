# Changelog

All notable changes to WiseMoney are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2026-10-08

### Added

- **WiseLearn** — money questions answered by a tutor (Gemma) that uses the 77
  lessons as its knowledge base: the server finds the relevant lessons by
  embeddings (`gemini-embedding-001`, keyword search as fallback) and each
  answer names its source lesson and publisher. About 100 words, two follow-up
  questions, topics to start from.
- **Update message** — after the first unlock on a new version, one toast says
  WiseMoney is up to date, with a link to What's new.

### Changed

- **Names** — the help assistant WiseBot is now WiseHelp; the literacy page is
  WiseLearn. Both share one chat layout: full-width answers, rounded composer.
- **Updates** — a new version downloads in the background and runs at the next
  full opening; WiseMoney never reloads itself, and no update prompt is shown.
- **Home** — four separate quick-action tiles, a plain help tip with a WiseHelp
  link, worded actions on alerts, toasts that follow the theme.

### Removed

- The lesson catalogue and lesson pages, and the lesson links in Plan: lessons
  are no longer on the phone, so WiseLearn needs a connection.

### Fixed

- An update could reload the app while the passphrase was being typed and
  lose it.
- On short screens the WiseLearn suggestions covered the topics.
- Numbered steps in answers restarted at 1 after a sub-list.

## [1.1.0] - 2026-10-05

### Added

- **Financial literacy** — a Learn page with 77 bilingual lessons in eight parts,
  written only from cited sources and readable offline, and a tutor with its own
  consent that sends nothing from the vault.
- **Editing from Activity** — an income or expense can be corrected or deleted
  from its detail sheet, whatever its age.
- **Restore from the landing page** — a backup can be restored without first
  creating an empty space.
- **Lesson links in Plan** — Budgets, Goals and Debts link to their lesson.

### Changed

- **First load** — the landing page paints before the vault and app code load:
  about 175 KB before first paint instead of 375 KB.
- **First run** — no intro screens, the default account is accepted, no tour
  step; a passphrase field can show what is typed.
- **Navigation** — three tabs with a capture button; the header holds
  reminders, help (WiseBot) and settings; Settings is a list with one screen per
  section.
- **Home** — the balance is the largest figure; one money format on screen.
- **Help and Updates pages** — a title and a list instead of long pages; help
  topics rewritten to match the app.

### Fixed

- Keyboard focus is visible; field borders and dark-theme text meet WCAG AA
  contrast; no text under 12 px; every button, link and field is at least 44 px.
- A WiseBot tip stays on the page where it appeared.
- The help and tutor gateways load on the production host.
- Plan rows show the frequency and the debt kind.

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
  searchable monthly activity view with CSV and XLSX exports.
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
- **WiseBot knowledge roadmap** — a reviewed architecture proposal now defines
  the future financial-education corpus, Burkina Faso and UEMOA context,
  Pinecone retrieval, live web evidence, offline learning pack, and the guarded
  path from tutoring to user-confirmed actions.

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
- **Clearer money workflows** — account creation explains that the opening
  balance is existing money rather than monthly income, while budgets explain
  that expenses are counted automatically by category and month across
  accounts, with an explicit remaining or exceeded amount.
- **Unambiguous money movement** — moving money to another WiseMoney account is
  an internal transfer and remains neutral in combined activity; sending money
  to a person or business is recorded as a categorized expense. Internal
  transfers between currencies reuse the locally managed exchange rate and
  preserve both source and destination amounts.
- **Smoother monthly story** — the dashboard keeps its existing hierarchy but
  now links directly to a focused monthly Activity page. Received, spent, and
  difference values share one calculation across the dashboard, account views,
  daily subtotals, search, and exports.
- **Calmer cycle closure** — the archive flow is split into preparation and
  confirmation, keeps the keyboard closed on entry, reduces repeated guidance,
  collapses the technical checksum, and separates reversible actions from the
  final destructive confirmation.
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
- **Modal and coach layering** — dialogs and sheets now use theme-aware, softly
  blurred overlays; mobile actions have consistent spacing; and WiseBot coaching
  stays behind active dialogs instead of competing with the current task.
- **Dashboard balance interpretation** — spending recorded before any monthly
  income is shown as use of the existing opening balance rather than an alarming
  claim that the user has exceeded their income.
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
