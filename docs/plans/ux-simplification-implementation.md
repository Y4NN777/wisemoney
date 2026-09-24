# UX Simplification — Implementation Plan

Status: PROPOSED · 2026-09-19 · Design: `docs/designs/ux-simplification.md`

## Phase 0 — Foundations (no visible change) — DONE 2026-09-19
- [x] `/help` and `/updates` are router routes under root; app routes nested in a pathless `_vault` layout that owns the gate + shell (`routes/_vault.tsx`); `App.tsx` renders `RouterProvider` once; window-event navigation deleted. Unlock state crosses navigation via a memory-only cached master key (`lib/vaultUnlocked.ts`); navigation helpers lazily import the router (no eval-time cycle).
- [x] Hardcoded `"XOF"` replaced by a single exported `DEFAULT_BASE_CURRENCY` (currencyStore, hooks, exportImport, CurrencySection). Locale-based guess deferred — needs a region→currency table.
- [x] `hasAnyMoneyMovement()` (plaintext index reads, no decryption) drives the dashboard mode; dead `useHasTransactions` removed; `useFinancialOperations` takes `enabled` so the O(n) decrypt skips setup/first-transaction mode.
- Verify: typecheck/lint/448 tests/build green; PWA smoke + WebAuthn smoke pass.

## Phase 1 — Instant capture — DONE 2026-09-24
- [x] Capture sheet (`components/CaptureSheet/`): amount-first, expense/income, optional note, inline date (`occurredAt` now exposed by `recordTransaction`), mounted in `_vault`, search-param deep links kept.
- [x] Silent "Cash" account via existing `createAccount` on first save; dashboard `setup` mode deleted (`getDashboardMode` → `first-transaction | active`, driven by `hasAnyMoneyMovement()`).
- [x] Category picker: direction-filtered (`domain/categoryHints.ts`), recents first (`domain/captureOrdering.ts`), inline error. **Deviation:** "Uncategorized" not allowed — `categoryId` is required by INV-EVT-03; mitigated by recents-first + preselect.
- [x] Transfer/Goal → sheet tabs; Manage → Settings "Accounts & categories"; `/capture` redirects Home and opens the sheet; old 4-tab page deleted.
- Verify: 454 tests, typecheck, lint green; PWA + WebAuthn smokes rewritten for the sheet and passing (2026-09-24). Smoke note: the management tabs now share the Settings page with the theme toggle, so dark-mode colour assertions wait for the element's transitions to finish.

## Phase 2 — One-step onboarding — DONE 2026-09-24
- [x] Setup-preview slides deleted (`OnboardingFlow`, `keyUnlock.onboarding.*`); Start → passphrase form.
- [x] Device unlock leaves setup and restore → Settings › Security row (`DevicesSection`) backed by `enableWebAuthnUnlock` / `disableWebAuthnUnlock` in `crypto/keyManagement.ts`; enabling re-derives from the passphrase because the session key is non-extractable (INV-KEY-03). Home offers it from the second passphrase unlock (`lib/deviceUnlockOffer.ts`, `components/DeviceUnlockOffer`), dismissable. Locking re-reads keyMeta so the new method applies at the next unlock.
- [x] "Online backup is not connected" removed from setup (`CloudEdgeAuth` + `keyUnlock.cloud.*` deleted) and from Settings › Security. Remaining infra vocabulary in help FAQ strings is Phase 4.
- Verify: Start → app in 4 interactions (Start, passphrase, confirm, Create); 463 tests; both smokes pass with device unlock enabled from Settings (2026-09-24).

## Phase 3 — Home + 3-tab IA
- [ ] Tab bar: Home · Activity · Plan + capture FAB.
- [ ] Home first viewport per design; charts below fold; split `Dashboard/index.tsx` into `HomeSummary` / `RecentMovements` / `AttentionCardHost` / `HomeCharts` while rebuilding.
- [ ] Plan page: 5 sections on one scrolling page; update `openReminder` deep-link targets.
- [ ] Assistant de-tabbed (`/assistant` kept, linked from Settings + Home card when configured).
- [ ] Unify box rounding: delete the duplicate radius block in `index.css` (~L125 vs ~L258), one scale for cards/controls/focus.
- Verify: everything ≤ 2 taps; reminder links land correctly; EN/FR parity test green.

## Phase 4 — Language + residue
- [ ] Replace infra vocabulary in user strings (EN/FR); WiseBot tips never auto-open over forms.
- [ ] Delete `rem.md`, stale `coverage/`; add `import/no-restricted-paths` (NFR-MOD-02).

Deferred: KeyUnlock split (after Phase 2 settles), `pillars/state` split (on demand), locale namespace split, all edge-deployment items.
