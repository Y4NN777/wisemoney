# UX Audit 2026-10 — Findings, Decisions, Open Items

Explanation · 2026-10-05 · Status: blocks A and B live (`44db447`); block C committed locally the same day.
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

## Block C — done 2026-10-05 (commits `b132a84`…`6879dbc`, local until pushed)

Y4NN's choices: header = bell, help, settings; WiseBot behind the help icon; Settings as a list with one
screen per section; extras = edit from Activity, restore on landing, lesson as a sheet, lesson links in Plan.

| Item | Result, measured at 360 px in French |
|---|---|
| Header | Three controls, 44 px each, one style; no language picker or install button in the app shell |
| WiseBot | Opens from the help button; no floating button on app pages; a button to the full guide in the panel |
| Settings | List of 21 controls (was 83 on one page); every section control at least 44 px except hidden checkbox inputs and two 40 px currency options |
| Titles and Plan | Titles on the page at 24 px; Plan is one card of five rows; no nested box on Home |
| Edit from Activity | Income and expenses editable and deletable from the detail sheet, whatever their age |
| Restore | Link on the landing page while the device holds no space |
| Lessons | Bottom sheet, 16 px body, left-aligned; `/learn?unit=<id>`; Plan links Budgets, Goals, Debts to a lesson |
| Plan row labels | Use existing keys; a test resolves them in both locales |

Touch targets, done 2026-10-05 after block C: Button, Input, Select, tabs and the dialog and sheet close
buttons are 44 px by default, and the remaining small controls were raised one by one. Measured at 360 px
in French on Home, Activity, Plan and its five pages, Learn, Assistant, Settings and the capture sheet:
no link, button or field under 44 px. Not covered: the focusable data points of the two charts under
Home's fold (14 px high), which belong to the chart text alternative below.
Capture sheet: Transfer and Goal stay as tabs (see `ux-simplification.md` decision 5, amended).
The landing download is unchanged by block C (148 KB of preloaded files, about 170 KB before paint).

## Not established

- No test with real users. Five tasks proposed: create a passphrase and say what "nobody can reset it" means;
  finish the first run unaided; record three movements; set a food budget; react to a coach tip.
- Device reality from StatCounter (Sept 2026): Android 94 %, 360 px viewports dominant. Captures were at 375 px
  on an iPhone profile; verification walks were at 360 px. No run on a real Tecno/Infinix phone.
- Screen-reader output, 200 % zoom, 320 px reflow, sunlight legibility.
- No Burkina-specific research on icons, numeracy or trust was found.

## Found on the way, still open

- Currency listbox keyboard model; chart text alternative.
- `HELP_KNOWLEDGE_VERSION` is unchanged although the help topics were rewritten twice: client and server
  compare it for equality, so a bump needs a rollout decision.
