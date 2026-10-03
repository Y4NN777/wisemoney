# Literacy corpus v0 — inventory

Quadrant: Reference · Date: 2026-10-03 (replaces the 2026-09-26 proposal) · ADR-0013 · Data: `apps/web/src/literacy/corpus.{en,fr}.ts`, version `0.1.0-2026-10-03`.

Direction (Y4NN, 2026-10-03): modern, international financial literacy adapted to young Africans; local practices are context, not the subject. Thirty-two units, EN + FR, same ids and figures in both (test-enforced). Each unit: summary, three or four points, one worked example in CFA francs, one warning, search aliases, framework basis.

**Provenance.** Every unit is original text written for WiseMoney. Structure follows the OECD/INFE Core Competencies Framework on Financial Literacy for Youth (2015) and the digital-finance competences of the EU/OECD-INFE framework for adults (2022); no text is reused from them. Arithmetic in every example was checked by hand. Hard facts used: the euro parity of the CFA franc (655.957), the BRVM as the WAEMU regional exchange, the existence of a legal usury ceiling in the WAEMU (no figure given: sources conflict, research log §B). No operator fee, cap or rate is stated; units tell the learner to check the current grid, and the tutor may fetch current figures with sources when web search is on.

**Review status.** Editorial draft. No local expert review yet; the Learn page says so. Review before removing that line: all of *Digital money* and *Borrow*, plus `family-support`, `betting`, `investing-basics`, `long-term`.

| Area | Units |
| --- | --- |
| Earn | `money-goals` · `first-income` · `irregular-income` · `family-support` · `lifestyle-pressure` |
| Spend | `budget-basics` · `budget-methods` · `tracking-spending` · `inflation` · `big-moments` |
| Digital money | `mobile-money` · `accounts` · `digital-safety` · `scams-ponzi` · `betting` · `remittances-fx` |
| Save and grow | `emergency-fund` · `where-to-save` · `compound-interest` · `risk-return` · `investing-basics` · `crypto-forex` |
| Borrow | `credit-basics` · `true-cost-credit` · `digital-loans` · `debt-capacity` · `out-of-debt` |
| Protect and build | `insurance` · `consumer-rights` · `business-money` · `net-worth-records` · `long-term` |

Not in v0: tax basics, country-specific pension rules, operator fee tables, local-language glossary.
