# Tech-Debt Triage

2026-09-19 · Debt from the codebase report; items in files the UX redesign rewrites are folded into it, not paid twice.

**Fix now** (independent of, or blocking, the redesign)
- Navigation triple-ownership (`App.tsx` window events, `KeyUnlock` own router) → UX Phase 0 blocker
- Hardcoded `"XOF"` fallback (`useFinancialState.ts:88`)
- `useHasTransactions` O(n) decrypt for a boolean
- N+1 collision queries in `appendEvents`/`replaceAllEvents` (`domain/eventStore.ts`) — hurts restore/import
- Residue: `rem.md`, stale `apps/web/coverage/`

**Fold into redesign** (do not fix separately)
- `Dashboard/index.tsx` split → Phase 3
- `KeyUnlock` split → Phase 2
- NFR-MOD-02 `import/no-restricted-paths` → Phase 4 lint sweep

**Deferred** (gated on edge deployment or stable)
- CORS (MED-02) + edge security headers (MED-03), CI binary scan, `DeleteExpiredRevoked` scheduler, in-memory rate-limit reset
- `pillars/state/index.ts` split; locale namespace split (parity test guards it)
