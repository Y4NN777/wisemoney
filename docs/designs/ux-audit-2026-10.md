# UX Audit 2026-10 — Findings, Decisions, Open Items

Explanation · 2026-10-05 · Status: blocks A and B shipped locally (commits `0cc315a`…`a5d3476`); block C open.
Method: 66 screenshots at phone size (EN, FR, dark), per-screen measurements, five specialist reviews
(published guidance, WCAG 2.2 AA, performance, cognitive UX, visual craft), each claim checked against the code.
Published guidance read on 2026-10-03: `research-sources/notes/UX-1-published-guidance.md` (git-ignored, 53 sources).
Earlier decisions stand: `ux-simplification.md`, `../plans/first-session-wisebot-literacy.md`.

## Measured, before and after

| What | Before | After | How measured |
|---|---|---|---|
| Landing download before first paint | 375 KB, 17 requests | 177–207 KB live (169 KB local) | Chrome, cold, no service worker |
| Landing LCP, Slow 4G (1.6 Mbps, CPU ÷4) | 3.5 s live, 3.0 s local | 2.2 s live, 1.6 s local | median of 3; budget 2.5 s |
| Landing LCP, 3G (400 kbps, CPU ÷6) | 10.1 s live | 5.9 s live, 5.1 s local | median of 3 |
| Taps, landing → Home | 20 | 11 | scripted walk, 360 px, French |
| Focus ring contrast | 1.5:1 | 4.6:1 light, 5.2:1 dark | computed from tokens |
| Field border contrast | 1.40:1 light, 1.80:1 dark | 3.4:1, 3.5:1 | computed from tokens |
| Text under 12 px | 20 sites | 1 (reminder count badge) | source and rendered check |

Live figures measured on 2026-10-05 after the deploy of `44db447`; unthrottled live LCP went from 1.4 s to 0.8 s.

## Decisions (Y4NN, 2026-10-05)

1. **First run is trimmed, not optional.** No intro slides, the account step accepts the default account, no tour
   step; the first movement and the plan step stay required.
2. **The landing page paints before the vault code loads.** Vault flows, the app shell, WiseBot and toasts are
   separate chunks; vault pages are React-lazy because the router waits for `lazyRouteComponent`.
3. **A coach tip belongs to one page.** It closes when the user leaves; no backdrop.
4. **One money format on screen** lives in `types/money.ts`: true minus sign, signed flows, "F CFA" in labels,
   placeholder without decimals for XOF. Files keep the hyphen.
5. **One focus indicator** for every control; per-component ring classes are not to be reintroduced.
6. **Help topics follow the app in the same change** that moves a screen or renames a button.

## Block C — open, design proposal first

- Header: six controls in three styles at 360 px; language picker duplicated in Settings.
- WiseBot launcher floats over content (Plan's Debts chevron, Home's spent row).
- Settings: 83 controls on one page, 65 under 44 px.
- Plan: five equal "0 …" cards for a new space (decision 4 of `ux-simplification.md` not fully landed).
- Page titles in bordered cards; card inside card on Home.
- Capture sheet: Transfer and Goal still top-level tabs (decision 5 said overflow).
- Lesson dialog: centred modal, 14 px bullets; a sheet with 16 px text would read better.
- Learn is not linked from Plan or from a recorded movement.

## Not established

- No test with real users. Five tasks proposed: create a passphrase and say what "nobody can reset it" means;
  finish the first run unaided; record three movements; set a food budget; react to a coach tip.
- Device reality from StatCounter (Sept 2026): Android 94 %, 360 px viewports dominant. Captures were at 375 px
  on an iPhone profile; verification walks were at 360 px. No run on a real Tecno/Infinix phone.
- Screen-reader output, 200 % zoom, 320 px reflow, sunlight legibility.
- No Burkina-specific research on icons, numeracy or trust was found.

## Found on the way, not fixed (out of scope)

- Plan rows for recurring items and debts use `planning.frequency.*` and `planning.debtKinds.*`, keys that exist
  in neither locale file (`src/ui/Planning/planSections.ts:88,101`): those rows would show the raw key.
- A transaction older than Home's five recent movements cannot be edited or deleted anywhere.
- Restore is reachable only in the installed app with no space; a browser tab must create a space, then import.
- Currency listbox keyboard model; chart text alternative.
