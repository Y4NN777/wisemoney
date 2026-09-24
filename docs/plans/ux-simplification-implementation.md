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

## Phase 3 — Home + 3-tab IA — DONE 2026-09-24
- [x] Tab bar: Home · Activity · Plan + centre capture button (`routes/_vault.tsx`); Settings is a header icon; Assistant reached from Settings and a Home card that appears once a provider is usable (`components/AssistantCard`).
- [x] Home first viewport from `selectHomeLayout()` (`ui/Dashboard/homeSelectors.ts`): summary, quick actions, one attention card (`DashboardAttention` `limit`), five recent movements from the operations projection (`RecentMovements`), assistant entry; charts, planning cards, filtered list and AI insight under `HomeFold` (mounted only when open). `Dashboard/index.tsx` split into co-located modules first, verbatim, in its own commit.
- [x] Plan page: five collapsible sections from `selectPlanSections()` on one scroll; empty sections are one quiet row; the five sub-routes stay, so `openReminder` targets did not need to change.
- [x] Box rounding: one literal scale in the `@theme` block (sm 6 · md 8 · lg 12 · xl 16 · 2xl 20), `:root` duplicate removed, `rounded-none` overrides dropped.
- Verify: 478 tests; both smokes green at each of the five commits (`d29c3cd`, `e02e1bd`, `3b73f6e`, `c6ff6d8`, `2b6be6e`).
- Follow-up (not done here): day/week/month presets on Activity, then remove `TransactionActivity` from the Home fold. "Activité September" — month name not localised in the French activity title (pre-existing).

## Phase 4 — Language + residue — DONE 2026-09-24
- [x] Infrastructure vocabulary removed from EN/FR strings (eight unreferenced keys deleted, live ones rewritten); `i18n.test.ts` now sweeps every leaf string of both locales against a forbidden list. Coach tips are not decided while a dialog or sheet is open (`CoachProvider` gates on `modalOpen`; WiseBot panel carries `data-state`).
- [x] `rem.md` / `coverage/` removed in Phase 0. NFR-MOD-02 and NFR-MOD-01 enforced with the core `no-restricted-imports` rule scoped by directory in `eslint.config.js` (no `eslint-plugin-import` dependency — substitution noted in commit `72f6cde`); `ui/Assistant` now imports through `pillars/intelligence`.

## Phase 5 — Landing pass — PROPOSED 2026-09-24
- [ ] Design proposal from screenshots first (Y4NN: "more better and premium"); then implement. Keep `Start` / `Open my space` names (smokes), no new dependencies, PWA precache size checked.

Deferred: KeyUnlock split (after Phase 2 settles), `pillars/state` split (on demand), locale namespace split, all edge-deployment items.
