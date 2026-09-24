# UX Simplification — Target Design

Status: PROPOSED · 2026-09-19 · Reference model: MyMoney (entry-first tracker)
Problem: users get lost; the loop costs too much (walkthrough: first expense ≈ 12 interactions, 3 screens, plus a 4-slide setup preview).

## Decisions

1. **Tabs: Home · Activity · Plan** + center capture FAB (replaces the Capture tab). Assistant leaves the tab bar → Home card once configured, entry in Settings. Settings moves to Home header.
2. **Home** = available balance + month received/spent/difference + 3–5 recent movements + at most one attention card. Charts move below the fold / into Activity.
3. **Activity** = existing `/operations`, promoted into the tab bar.
4. **Plan** = one scrolling page; Budgets, Goals, Planned, Recurring, Debts as collapsible sections; empty sections collapse to one quiet row (no five zero-tiles).
5. **Capture sheet** = amount-first, keypad focused; auto-creates a "Cash" account in the base currency on first save; categories filtered by direction, recents first, category optional; Transfer/Goal move into the sheet overflow; Manage (accounts/categories) moves to Settings.
6. **Onboarding in one step**: delete the setup-preview slides; landing → passphrase → app. Device unlock offered after second unlock or in Settings. Remove the "Online backup is not connected" paragraph. No deployment/infrastructure vocabulary in user-facing strings.

7. **Visual detail — box rounding**: boxes stay rounded, but *consistently*. `index.css` defines the radius scale twice (fixed values at ~L125–130, then overridden at ~L258–261), so components round unevenly; rebuilt screens use one radius scale (cards / controls / focus ring) from a single token set.

Non-goals: no crypto changes, no feature removal, Swiss-ledger visual system unchanged.
Constraints: CONTRACT.md invariants and `dashboard-monthly-activity.md` semantics (transfers neutral, destination-determines-nature) apply as-is — not restated here.
