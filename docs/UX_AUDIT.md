# WiseMoney UX and localization audit

## Scope

This audit covers the mobile-first web app, first-run experience, navigation,
settings, help content, and the English/French localization path. The primary
user is the overwhelmed tracker defined in the product documents: someone who
needs to record and understand money without first learning the system.

## Problems found

1. First launch presented the product preview, install instructions, workspace
   map, four setup explanations, guide cards, and an FAQ before setup. The same
   concepts appeared again in onboarding.
2. Language selection existed only before the private space opened. Once inside
   the app, there was no discoverable setting to change it.
3. The detector checked the browser language before the saved preference, so a
   deliberate language choice could be lost on reload.
4. Several update messages, close labels, navigation labels, error paths, and
   system category names bypassed translation.
5. Settings opened with browser, viewport, locale, and session metadata, then
   displayed every advanced configuration area in one long page.
6. Currency pickers exposed English country aliases in French mode and formatted
   dates and money from the browser locale instead of the selected app language.
7. External display fonts added network work to a local-first interface.

## Changes made

- Reduced first launch to one primary action and three numbered promises:
  private, offline, and optional assistant.
- Moved the detailed product journey, FAQ, and install guidance into a reusable
  Help Center available before and after setup.
- Added a persistent English/French switch in the app header and an explicit App
  language setting.
- Reordered locale detection so the saved choice wins, and synchronized the HTML
  language for accessibility and locale-aware formatting.
- Localized PWA updates, dialog and sheet close labels, navigation labels, load
  failures, assistant failures, and default system category display names.
- Removed untranslated country-detail rows from currency selection while keeping
  currency names localized through `Intl.DisplayNames`.
- Reorganized Settings around progressive disclosure: language stays visible;
  money, data, assistant, and security open only when requested.
- Removed low-value browser and viewport metadata from the user-facing session
  card.
- Replaced external fonts with the system sans-serif stack and adopted a compact
  Swiss-ledger visual hierarchy with one blue accent and visible grid rules.

## Verification

- English and French contain the same translation-key set.
- A localization test prevents key drift and blank French values.
- Mobile runtime checks cover first launch, live English/French switching, Help,
  onboarding, and the simplified Settings page.
- Typecheck, lint, unit tests, and the production PWA build pass.

## Product follow-up

The next useful input is observation rather than more interface: test first
expense entry with a few target users and record where they hesitate. That will
show whether Capture should open directly to amount entry or whether account
setup needs a one-time prompt.
