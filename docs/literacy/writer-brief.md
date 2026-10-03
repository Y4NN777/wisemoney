# Writer brief — WiseMoney literacy course

Quadrant: Reference · Date: 2026-10-03 · The rules every lesson in `apps/web/content/literacy/` was written under. Read fully before writing or revising a lesson.

## Who reads the lessons
Young people in BURKINA FASO who know nothing about finance. Phone screen, a few minutes per lesson. Bilingual app: every lesson exists in English and in French with the same meaning and the SAME FIGURES.

## What financial literacy means here (agreed with the owner)
Making money serve your life. Three parts together: KNOWING (how money, interest, credit, risk, institutions work), DOING (habits: know where money goes, spend less than you earn, plan, save without effort, borrow only what you can repay, verify before trusting), BELIEVING YOU CAN (confidence to decide, ask, say no, plan ahead). Behaviour matters as much as knowledge. OECD definition (2020 Recommendation): "a combination of financial awareness, knowledge, skills, attitudes and behaviours necessary to make sound financial decisions and ultimately achieve individual financial well-being."

## The non-negotiable rule
The owner rejected four earlier versions because they were written from the writer's own head. WRITE ONLY FROM THE NOTES FILES LISTED IN YOUR TASK. Every point, definition, method, figure and local fact in a lesson must be traceable to a passage in those notes. If the notes do not support something, leave it out. If a useful fact is unknown (a fee, a rate, a minimum), do not invent it: tell the learner to ask for it in writing, or say it is not published. Never present something marked UNVERIFIED, snippet-only or "press only" in the notes as a fact; either leave it out or attribute it ("the press reported…") only if it is important.

## Local rules
- BURKINA FASO, not Côte d'Ivoire. Notes from an ILO booklet for Côte d'Ivoire (ILO-CI) are a MODEL FOR METHOD only: use its definitions, tools and way of explaining, never its Ivorian specifics (towns, cocoa cooperatives, CMU health scheme, minimum wage, its characters Koffi/Aya/Moussa/Yao). Same for Ghana, France, US material: methods transfer, institutions and products do not.
- Local facts must be Burkinabè or regional (UEMOA/BCEAO/BRVM), taken from the notes with their date.
- Money in "F CFA" amounts realistic for a young person in Burkina (small sums). You may create simple worked examples with fictional first names common in Burkina (for example Awa, Issa, Salif, Aminata, Rasmané, Fatou); an example illustrates a method from the notes, it must not smuggle in a new fact. RECOMPUTE every figure yourself and double-check the arithmetic; the source booklets contain errors.
- No product recommendation, no "you should buy". Education, not advice. Naming an institution as a fact (for example what Coris Bourse publishes about opening an account, with the date) is allowed when the notes support it.
- Copyright: write everything in your own words. Do not copy sentences from the sources. A short quotation (under 20 words) is allowed only when the exact wording matters (a legal rule, an official definition), in quotation marks.

## Style
Plain words, short sentences, second person ("you" / "vous"). Explain each finance word the first time it appears, inside the sentence. No jargon, no headings inside fields, no emojis, no exclamation marks. French must be natural French written for Burkina (not a word-for-word translation), using "vous".

## Lesson format (JSON)
Each lesson:
{
  "id": "kebab-case-id",                // stable, English, unique
  "sources": ["source-id", ...],        // ids from the registry you build (see below)
  "en": { "title": "...", "summary": "...", "points": ["...", "...", "..."], "example": "...", "action": "...", "watchOut": "...", "aliases": ["...", ...] },
  "fr": { same fields, in French },
  "evidence": [ { "claim": "short description of a point or figure", "source": "source-id", "where": "notes file and section/page, e.g. ILO-CI.md B p.41" } ]
}
Field rules:
- title: at most 8 words; says what the learner will be able to do or understand.
- summary: one or two sentences, at most 40 words.
- points: 3 or 4 items, each one idea, at most 32 words.
- example: one worked case in F CFA with the arithmetic visible, at most 70 words. Same numbers in EN and FR (EN writes 15,000 F; FR writes 15 000 F).
- action: ONE small concrete thing to do this week (the "doing" part), at most 25 words. Start with a verb.
- watchOut: one warning, at most 28 words.
- aliases: 6 to 10 search words or phrases a beginner would type, in that language, lower-case (include everyday words, not only the technical term).
- evidence: at least one entry per point and one for every figure or local fact. This is how the owner checks nothing was invented.

## Source registry
At the top level of your output give "sourceRegistry": { "source-id": { "name": "Publisher — Title (year)", "url": "https://…" }, … } for every source id you used. Take names and URLs from the notes. Use these ids when they apply (reuse, do not rename): ilo-ci-2023, ilo-gh-2020, ilo-iyb, cfpb-ymyg, fdic-money-smart, sec-roadmap, sec-investor-gov, amf-fr, amf-umoa, brvm, dcbr, umoa-titres, bceao, umoa-usury-2025, umoa-savings-2014, fgdr-umoa, cima-code, cgi-bf, findex-2025, finscope-bf-2016, oecd-2020, ecb, banque-de-france, iefp, vie-publique, commission-bancaire, apsfd-bf, rcpb, coris-bourse, creditinfo, oqsf-bf, bclcc, st-pif-2023, dgjep-2018, lefaso, cerise-sptf, umoa-banking-law, umoa-microfinance-law, care-vsla, aflatoun, jpal-ipa. Add new ids when needed.

## Output
One JSON file at the path given in your task: { "area": "<area id>", "sourceRegistry": {…}, "lessons": [ … in teaching order … ], "leftOut": [ "things the outline asked for that the notes could not support, one line each" ] }. Validate that the file parses as JSON (python3 -m json.tool) before you finish. Write nothing else in the repository. Do not run git.
