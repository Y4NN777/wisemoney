# Research log — Literacy tutor on Gemma, and a literacy corpus for Burkina/UEMOA

Quadrant: Reference · Date: 2026-09-26 · Pipeline: two web-research runs (Gemma hosting/terms; corpus sources), summarised here for the ADR. Every figure below carries its source; items the runs could not verify are marked UNVERIFIED and must not be relied on.

## A. Serving Gemma for a second gateway

**Facts**
- The Gemini API serves two Gemma ids: `gemma-4-31b-it` and `gemma-4-26b-a4b-it` (page updated 2026-07-02). Our help gateway's id is current. 256K context, text + image input. Gemma 4 is Apache 2.0. [S1][S3][S4]
- Gemini-API pricing lists Gemma 4 as **free of charge only; the paid tier is "Not available"; "Used to improve our products": Yes** on the free tier. [S6]
- Gemini API Additional Terms (2026-03-23): Unpaid Services — Google uses submitted content and responses to improve products, human reviewers may read them, "do not submit sensitive, confidential, or personal information". Both tiers: "Don't rely on the Services for … financial … advice"; users 18+. [S8]
- Consequence: **every byte the tutor sends to Gemma via the Gemini API is Unpaid-Services data** — usable for training and readable by humans — regardless of billing. That is compatible with an explicit disclosure ("what you type is sent to Google and may be used to improve its products"), never with a "nothing leaves the device" reading. The help gateway already discloses this.
- Gemma Prohibited Use Policy forbids unlicensed financial practice and misleading claims of expertise; education that issues no personalised decision sits outside it. [S9][S10]
- Streaming: `streamGenerateContent?alt=sse` — the deployed help gateway already uses it with a Gemma id (`api/help/_helpGateway.ts:181`, asserted in its test). [S20]
- Alternatives: second Google Cloud project + AI Studio key (free, per-project quota, same data terms); **Vertex AI MaaS** `gemma-4-26b-a4b-it` (prompts not used to train foundation models by default; per-token billing; price not verified); OpenRouter `google/gemma-4-26b-a4b-it` ($0.0675 / $0.225 per 1M, no-training account setting, third party in the trust story); Together (31B only); Groq (none). [S11]–[S19]

**Unverified:** Gemma free-tier numeric rate limits; whether billing changes Gemma traffic to Paid handling (read literally: no); Vertex MaaS price and regions.

**Recommendation carried into the ADR:** second Google Cloud project with its own AI Studio key (`LITERACY_GEMINI_API_KEY`), model pinned server-side, tutor route sends only the typed question plus an allow-listed non-financial context (no amounts, merchants, balances), no image upload, a visible "education, not advice" line and the Google-data disclosure; Vertex AI MaaS is the durable upgrade if a no-training guarantee becomes a product requirement.

## B. Corpus sources

**International**
- G20/OECD INFE Core Competencies Framework for Adults (2016): four areas — Money and transactions; Planning and managing finances; Risk and reward; Financial landscape. Licence UNVERIFIED (OECD "open by default" CC BY 4.0 applies from 1 July 2024 only) → cite/link. [C1][C2]
- EU/OECD-INFE Financial competence framework for adults (2022): finer grain, digital finance. © EU/OECD, no CC → structure as inspiration, text link-only. [C3]
- OECD/INFE Toolkit 2026 (measurement, not teaching); OECD Recommendation 2020 (policy framing). [C4][C5]
- World Bank OKR: per-item CC licences (BY / BY-NC / BY-NC-ND); Findex 2025: Burkina account ownership 51.4 % (2024) vs 36.1 % (2021). [C6][C7]
- CGAP WAEMU consumer-protection lab, Burkina survey (2024): network problems 55 %, missing SMS confirmation 32 %, fraud targeting 18 %, actual loss 3 %, agents refusing small transactions 26 %. Reuse terms UNVERIFIED → cite. [C8]
- **ILO financial-education trainee booklets** (e.g. farmers and rural workers, Côte d'Ivoire, FR, Oct 2023): ILO material dated ≥ 3 May 2023 is CC BY 4.0 with a mandatory "not prepared, reviewed or endorsed by the ILO" notice — the closest French West-African base that may be *adapted*; confirm the booklet's own copyright page first. [C9][C10]
- CARE VSLA manual (2024): all rights reserved → methodology reference only. [C11]

**Local / regional**
- BCEAO regional financial-inclusion strategy (2016; 2025–2030 framework referenced); **PREF-UEMOA** regional financial-education programme (validated Oct 2019; targets adults 18–35, women, employees, rural populations, SMEs); press (June 2026, citing BCEAO's 2025 report) says 186 modules exist in 25 languages with a dedicated site — site and texts NOT located (UNVERIFIED; ask BCEAO). [L1][L2][L3]
- BCEAO regulation useful as facts: e-money caps for identified clients (2 M FCFA per reload / 10 M monthly, per the 2020 communiqué); Instruction 001-01-2024 on payment services (complaints handling art. 16, tariff-change notice art. 29); usury ceiling 24 % for SFD on the BCEAO page, press reports new ceilings from 1 June 2026 (banks 14 %, SFD 24 %) — conflict, UNVERIFIED. [L4][L5][L6][L7]
- Burkina: SNFI 2019–2023 (75 % adult access target; financial education a named lever); successor strategy not found; ANPFI created Feb 2025. No national FE strategy document located. AP/SFD-BF: directory and complaints portal, no public guide. [L8][L9][L10]
- Mobile money (official, all rights reserved, FR): Orange Money BF fee grid (deposit free, withdrawal 1 % TTC, OM→OM 0, to non-OM 1 %) and T&Cs caps (non-identified 200 000 F; identified 2 M daily / 10 M monthly), complaint SLA 24 h–7 days; Coris Money grid (deposit and account-to-account free up to 2 M, withdrawal 1 %); Moov Money: no public grid → fees UNVERIFIED. [L11][L12][L13][L14]
- Seasonality: FEWS NET lean season June–Aug, main harvest Sept–Nov; school year starts 1 Oct; private-school fee cap decree (May 2026). [L15][L16]

**Licensing summary:** adapt with attribution — ILO booklets ≥ May 2023 (per-booklet check), World Bank CC BY items, OECD items published ≥ July 2024; cite/link only — OECD 2016/EU 2022 frameworks, BCEAO texts, Burkina government, CARE, operators' pages, CGAP; regulatory figures and fees are facts: restate with source, "as of" date and a review cadence.

**Gaps needing original writing + local expert review:** tontine mechanics as practised in Burkina; Moov Money fees/caps; informal credit norms (boutiquier credit, moneylenders) and true cost; post-2023 national strategy and the BCEAO module site; lean-season/school-fee budgeting; Burkina-specific mobile-money fraud scripts; local-language glossary (out of v0).

## C. Corpus v0 — proposed table of contents (32 units, EN + FR)

A Money basics — 1 What money does (XOF, EUR peg) · 2 Cash vs wallet vs bank · 3 Reading a receipt / SMS confirmation · 4 Prices and the cost of waiting
B Mobile money in Burkina — 5 Opening and identifying an account (KYC tiers, caps) · 6 Fees explained (per-operator "as of" tables) · 7 Wrong recipient and complaints · 8 Fraud and PIN hygiene · 9 Paying bills, school fees, merchants · 10 Mobile money ↔ bank
C Budgeting and cash flow — 11 Income vs expenses, needs vs wants · 12 A monthly budget · 13 Irregular income (harvest, trade, daily) · 14 The lean-season plan · 15 The school-fee calendar · 16 An emergency fund in XOF
D Saving — 17 Why and where (cash, wallet, SFD, bank) · 18 Tontines: rules and risks · 19 VSLA/AVEC groups · 20 Goals and automatic set-asides
E Borrowing and debt — 21 What credit costs (interest, TAEG, fees) · 22 Microfinance loans in BF · 23 Informal credit · 24 Debt danger signs · 25 Group guarantees
F Risk and protection — 26 Insurance basics · 27 Scams and pyramid schemes · 28 Your rights as a financial consumer · 29 Remittances and comparing costs
G Planning ahead — 30 Small-business money: separate pots · 31 Long-term goals (land, housing, retirement, CNSS/CARFO) · 32 Glossary EN/FR

## D. Addendum 2026-10-03 — Google Search grounding with Gemma 4

Checked for Y4NN's question "what about the web search for Gemma 4". The official pages disagree:
- Gemma on the Gemini API (updated 2026-07-02) has a "Google Search" section: "Ground Gemma 4 responses in real-time web data with Google Search", with a sample using `gemma-4-26b-a4b-it` and `tools=[{"google_search":{}}]`. [S1]
- The pricing page lists "Grounding with Google Search" as "Not available" for Gemma 4 on both tiers. [S6]
- The grounding page (updated 2026-09-23) lists only Gemini models as supported. [S21]

UNVERIFIED which is right: no call was made with a real key. The gateway therefore treats it as an optional server switch with a lessons-only fallback (ADR-0013 amendments). To settle it: set `LITERACY_WEB_SEARCH=on`, ask a current-fact question, and check that the answer is labelled "with web search" and lists sources.

## Sources

Gemma: S1 ai.google.dev/gemma/docs/core/gemma_on_gemini_api · S3 …/model_card_4 · S4 blog.google …/gemma-4/ · S6 ai.google.dev/gemini-api/docs/pricing · S8 ai.google.dev/gemini-api/terms · S9 ai.google.dev/gemma/prohibited_use_policy · S11 ai.google.dev/gemini-api/docs/api-key · S12 docs.cloud.google.com …/maas/google/gemma-4-26b-a4b-it · S14 openrouter.ai/api/v1/models · S16 openrouter.ai/docs/features/privacy-and-logging · S17 together.ai/models/gemma-4-31b · S19 console.groq.com/docs/models · S20 ai.google.dev/api/generate-content · S21 ai.google.dev/gemini-api/docs/google-search
Corpus: C1 gpfi.org …/Core-Competencies-Framework-Adults.pdf · C2 oecd.org/en/about/oecd-open-by-default-policy.html · C3 finance.ec.europa.eu …/220111-financial-competence-framework-adults_en.pdf · C4 oecd.org … oecd-infe-toolkit … 2026 · C5 legalinstruments.oecd.org ids=663 · C6 worldbank.org/ext/en/legal/terms-conditions/open-knowledge-repository · C7 data.worldbank.org/indicator/FX.OWN.TOTL.ZS?locations=BF · C8 cgap.org/blog/in-burkina-faso-most-vulnerable-dfs-users-need-better-protection · C9 ilo.org/resource/training-material/list-financial-education-training-materials · C10 ilo.org/rights-and-permissions · C11 care.org/resources/vsla-training-manual/ · L1 bceao.int/fr/documents/strategie-regionale-dinclusion-financiere · L2 bceao.int …/Programme régional d'Education financière dans l'UEMOA.pdf · L3 fr.allafrica.com/stories/202606220839.html · L4 bceao.int …/instruction_no008_05_2015 · L5 bceao.int/fr/communique-presse/… paiements-electroniques · L6 bceao.int …/Instruction-No001-01-2024 · L7 bceao.int/fr/documents/taux-dusure-… · L8 anpfi.switch-maker.net …/Doc-Stategie-Nationale-de-la-Finance-Inclusive-2019.pdf · L9 burkina24.com/2025/11/28/… · L10 apsfd-burkina.org · L11 orange.bf/fr/tarifs-orange-money.html · L12 orange.bf/fr/termes-et-conditions.html · L13 burkina.coris.money/grille-tarifaire/ · L14 moov-africa.bf/moov-money-particuliers/ · L15 fews.net/west-africa/burkina-faso · L16 fr.allafrica.com/stories/202609160592.html
