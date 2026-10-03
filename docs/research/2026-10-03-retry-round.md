# Research log — Retry round (round 3): official sites read with a real browser

Quadrant: Reference · Date: 2026-10-03 · Trigger: Y4NN, "retry… the internet is big", then "je suis au Burkina Faso pas Côte d'Ivoire" and "on fera avec ce qu'on a". Follows the two logs of the same date. Verbatim notes: `research-sources/notes/R3-1…R3-7-*.md` (local, git-ignored). The sources actually used by lessons are listed with their URLs in `docs/literacy/course-v1.md`.

## Method change

Rounds 1–2 relied on a fetch tool that returns a digest, is capped at 10 MB and sees only the empty shell of JavaScript sites. Round 3 used `tools/research/render.mjs` (Playwright driving Chrome), direct downloads with `curl`, and `pdftotext`. Seven researchers ran in parallel. Result: the regulator's site, the brokers' sites and large PDFs that had returned nothing were read.

## What it established

| Topic | Finding | Source |
| --- | --- | --- |
| Definition | OECD: "a combination of financial awareness, knowledge, skills, attitudes and behaviours necessary to make sound financial decisions and ultimately achieve individual financial well-being" | OECD/LEGAL/0461 (2020), section I |
| Regulator | Investor guide and 43-term glossary; licence checker (Coris Bourse = SGI 2010-02, 3 Sept 2010); complaints in three steps under Instruction 50/2016 | amf-umoa.org |
| Market | 48 listed shares and 212 bonds (bulletin of 2 Oct 2026); market commissions 0.2 % + 0.1 %; settlement at two days since 4 Dec 2025; 194,222 securities accounts in the region, 13,154 in Burkina Faso (31 Mar 2024) | BRVM, DC/BR, AMF-UMOA study |
| Brokers | Four SGIs in Burkina; Coris Bourse publishes minimum (50,000 FCFA), documents, online form, app; no Burkina broker publishes a fee grid; dated grids exist in Côte d'Ivoire | brokers' sites |
| Funds | Official fund documents with entry, exit and management fees and risk levels (AFRICAM 2022, Coris Actions 2023) | management companies |
| Government securities | Individuals subscribe through a bank or SGI; nominal values 10,000 FCFA (bond) and 1,000,000 FCFA (bill) for Burkina's issue of 7 Oct 2026 | UMOA-Titres |
| Banking | 16 banks, 4 financial establishments, 416 branches, 3,421,286 accounts (end 2025); strict bancarisation 23.4 %, broad 37.9 %, overall use 79.7 % (2024) | Commission Bancaire, BCEAO |
| Microfinance | 73 institutions; 36 tracked: 2,067,873 members, 536.0 bn FCFA deposits (30 Sept 2025); Caisses Populaires account 8,000 FCFA | BCEAO, RCPB |
| Deposit guarantee | 1,400,000 FCFA per depositor at a bank, 300,000 at a microfinance institution; e-money coverage not stated in any text | Décision n°009/2017/CM/UMOA art. 2 |
| Free banking services | Instruction n°004-06-2014 (19 services); complaints answered within one month | BCEAO; Circulaire n°002-2020/CB/C |
| E-money | Identification required; balance cap 2,000,000 FCFA; issuers may not pay interest | BCEAO Instruction n°008-05-2015 |
| Tax | Wage tax brackets (CGI art. 112); micro-business contribution; securities income 6 % / 12.5 % (art. 140), share gains 10 % (art. 179), unchanged by the 2024–2025 finance laws | DGI |
| Social protection | Law 004-2021/AN; Decree 2023-0129: employer 16 %, employee 5.5 %, voluntary 14 %; health insurance 5 %, 15,000 / 4,000 FCFA | legal texts, ministry summary |
| Business | Registration at the CEFORE: 46,000 FCFA (47,380 online) for a sole owner, sheet of 1 June 2026 | Maison de l'Entreprise |
| Behaviour | Defaults, commitment and labelled savings, reminders raise saving in field trials (Afghanistan, Malawi, Philippines, Kenya); null results kept; no trial in Burkina Faso | J-PAL, IPA |
| Burkina teaching material | Two government participant booklets (ST-PIF 2023; Ministry of Youth 2018), read as third-party uploads, provenance unconfirmed | Scribd copies |
| Real questions | 68 questions from the public with URLs, 26 from Burkina (LeFaso.net comment threads) | R3-4 notes |
| Open-licence teaching | ILO business manuals (CC BY-SA 3.0 IGO); vie-publique.fr and economie.gouv.fr (Licence Ouverte 2.0); ECB and Banque de France reusable with source | R3-3 notes |

## Conflicts left open

CNSS contribution split (2023 decree versus older online guides); two different Orange Money fee grids online on the same day; older pages still stating three-day settlement.

## Not found

The BCEAO regional programme's modules (its 2024 report says only that a site was designed); any broker fee grid in Burkina; microfinance loan rates; Moov Money fees; the mediation body's contact details; a saving trial in Burkina Faso; official downloads of the two Burkinabè booklets.

## Safety notes

`cnss.bf` and `cnssbf.org` showed defacement pages and `coris-asset.com` carried injected casino links on 2026-10-03. The course links to none of them (enforced by a test).
