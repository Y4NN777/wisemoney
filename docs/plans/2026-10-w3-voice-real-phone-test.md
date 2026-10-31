# Voice: test on real phones with real voices

2026-10-31 · Diátaxis: How-to · Owner: Y4NN · Follows `2026-10-w3-voice.md` (step 5, roadmap item Y2).
Status: ready to run. Nothing in this plan changes shipped behaviour except step 4.

## Why

The voice pack (Whisper tiny) scored 1 of 5 on **synthetic** speech and was switched off. Synthetic
speech differs from a person talking in a market with a phone in one hand, so that result decides
nothing. This test replaces it with evidence from the phones and voices that matter, and ends with
one of three decisions.

## What is measured

For every phrase and engine:

| Field | How it is judged |
|-------|------------------|
| Amount | exact match after the quick-line reader |
| Direction | matches, or none expected |
| Note | contains the expected word (accents and case ignored) |
| Delay | seconds from the end of speech to text (engines A and C only; B cannot be timed) |

A phrase **passes** when amount, direction and note are all right. Thresholds, unchanged from the W3
plan: an engine qualifies with 4 of the 5 set-up phrases, and A and C need a median delay of 3 s or
less. This test adds a wider bar so one lucky run cannot decide: **at least 24 of 30 phrases (80%)**.

## Setup

- **Phones:** Y4NN's Android (browser and version noted) and Y4NN's iPhone (Safari and the
  home-screen app, noted separately). A third, low-end Android if one is available.
- **Speakers:** Y4NN, plus two other people with a different accent or pace. Same phrases for
  everyone.
- **Conditions:** quiet room, then outside with street noise. Each phrase is said once per
  condition; a repeat is not allowed, because users will not repeat either.
- **Build:** engines A and B need nothing. Engine C needs a **preview build with
  `PACK_OFFERED = true`** (`apps/web/src/voice/pack/packFiles.ts`), deployed as a Vercel preview and
  never merged to `main`.

## The 30 phrases

The five set-up phrases, then 25 more that cover how people really speak. All are in the reader's
test bank logic; a miss is the engine's.

1. Essence moto deux mille cinq cents
2. Crédit Orange mille francs
3. Loyer quatre-vingt-dix mille
4. Salaire cent soixante-quinze mille
5. Awa m'a remboursé douze mille cinq cents
6. Taxi deux mille
7. Pain deux cent cinquante
8. Deux pains à deux cent cinquante
9. Riz et huile cinq mille
10. Transport mille cinq cents
11. Moov Money recharge cinq cents
12. Frais de transfert Orange Money cent cinquante
13. Facture d'eau dix-huit mille
14. Facture d'électricité vingt-cinq mille
15. Médicaments trois mille cinq cents
16. École des enfants cinquante mille
17. Cadeau pour maman dix mille
18. Tontine quinze mille
19. J'ai reçu vingt mille de mon client
20. Vente de tissu soixante mille
21. Boisson cent francs
22. Bouffe midi mille
23. Taxi cinq cents et pain deux cent cinquante
24. Remboursement Issouf quatre mille
25. Deux mille cinq cents carburant
26. Quarante mille loyer atelier
27. Le prix du marché mille huit cents
28. Cent francs de crédit
29. Salaire du mois deux cent mille
30. Restaurant sept mille cinq cents

For the English app, say the English equivalents of 1 to 10 and 21 to 25; the reader's English bank
covers them.

## Procedure

1. Open Settings › Voice. Run the five-phrase test for each engine the phone offers. Write the
   engine the app picks and its reason.
2. Run phrases 6 to 30 in the quick line, one at a time, with the engine under test. Record the
   text the engine produced and whether amount, direction and note were right.
3. Repeat in the second condition.
4. For engine C only, open the preview build, download the pack on Wi-Fi, note download time and
   free storage, then run steps 1 to 3. Delete the pack afterwards from Settings › Voice.
5. Fill one row per phrase in the results table below, copied into `docs/research/` as
   `2026-11-voice-real-phone-results.md`.

## Results table (copy this)

| Phone | Engine | Condition | Phrase | Heard text | Amount | Direction | Note | Delay s |
|-------|--------|-----------|--------|------------|--------|-----------|------|---------|
|       |        |           |        |            |        |           |      |         |

## Decision

| Result on real voices | Decision |
|-----------------------|----------|
| Engine A or B reaches 24 of 30 on every phone | The pack stays off. Make the right engine the default and say so in the set-up screen |
| C reaches 24 of 30 and a median of 3 s or less, A and B do not | Switch the pack on in a normal release; keep it behind the existing storage and Wi-Fi checks |
| Nothing reaches 24 of 30 | Keep B as the supported route, make the keyboard microphone a first-class, guided step in onboarding, and try one larger model (Whisper base, about twice the size) as a separate experiment |

Do not tune the reader to hide an engine's mistakes. If the reader is the cause, add the phrase to
`quickEntry.bank.json` first, then fix the reader.

## What stays out

No recording is kept. Audio stays in memory, and the results table holds text and pass marks only.
Other people's voices are used only with their agreement and for this test.
