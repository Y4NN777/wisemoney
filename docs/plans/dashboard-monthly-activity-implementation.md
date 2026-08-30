# Plan d’implémentation : dashboard mensuel et activité

Date : 2026-08-30
Branche cible : `main`
Version : `1.0.0`
Design approuvé : `docs/designs/dashboard-monthly-activity.md`
État : IMPLEMENTED

## Résultat attendu

Améliorer la compréhension du dashboard sans le refondre : conserver ses
fonctions actuelles, rapprocher le solde, la courbe et les agrégations du mois,
puis ouvrir une page Activité légère pour le détail et l’export.

La règle métier centrale est unique :

- destination suivie dans WiseMoney : transfert interne, neutre au niveau global ;
- destination extérieure : dépense catégorisée, agrégée et liée au budget ;
- transfert interne multidevise : débit dans la devise source et crédit converti
  dans la devise cible avec le taux local enregistré au moment du mouvement.

Il n’y a ni rapprochement flou, ni serveur, ni migration destructive, ni
suppression d’une capacité existante du dashboard.

## Ce qui existe déjà et sera réutilisé

- `transfer_created`, `recordTransfer()` et le contrôle de concurrence
  `expectedLastEventId` ;
- le modèle local de devises `loadCurrencyContext()` / `convertUsingContext()` ;
- la projection `FinancialOperation[]` et son cache React Query ;
- `/operations`, sa recherche, ses filtres, ses groupes journaliers, sa
  pagination et son panneau de détail ;
- le graphique de solde, les filtres mois/compte, les budgets, objectifs,
  engagements, actions rapides et opérations récentes du dashboard ;
- `write-excel-file`, déjà chargé dynamiquement pour les relevés XLSX ;
- les stores d’attention, les tokens clair/sombre et le smoke PWA.

Le plan touche plus de huit fichiers parce qu’il inclut les contrats, leurs
tests, les deux langues et le smoke mobile. Il n’introduit aucun service et un
seul nouveau module fonctionnel, celui de l’export d’activité. Le périmètre a
déjà été réduit aux décisions produit convenues.

## Invariants à ne pas casser

1. Le snapshot reste l’autorité des soldes, budgets, objectifs et engagements.
2. Un transfert interne ne devient jamais un revenu ou une dépense globale.
3. Une destination extérieure nouvelle ne produit plus de `transfer_created`.
4. Les anciens transferts externes restent rejouables et lisibles comme sorties
   non classées, sans réécriture du journal.
5. Le montant source et le montant cible d’un transfert multidevise sont
   immuables ; un taux modifié plus tard ne change pas l’historique.
6. Une absence de taux bloque l’écriture entière : aucun débit partiel.
7. Dashboard, Activité et export consomment le même résumé d’opérations.
8. Les backups, exports complets des Paramètres et clôtures de cycle ne changent
   pas de format ni de comportement.
9. Les thèmes clair/sombre, le mode hors ligne, l’édition et la suppression de
   transactions restent fonctionnels.

## Architecture et flux de données

```text
CAPTURE
  destination WiseMoney ──> recordTransfer()
                               ├─ même devise: amount
                               └─ autre devise: amount + destinationAmount
                                      via CurrencyContext local

  destination extérieure ─> recordTransaction(direction="expense", merchant,
                                                categoryId, amount)

JOURNAL CHIFFRÉ
      |
      v
projectFinancialOperations()
      |
      +─> FinancialOperation[] (cache unique par coffre déverrouillé)
             |
             +─> summarizeMonthlyActivity() ─> Dashboard + en-tête Activité
             +─> selectExpensesByCategory() ─> répartition
             +─> selectBalanceTimeline() ────> courbe
             +─> filterFinancialOperations() -> liste uniquement
             +─> exportActivityCSV/XLSX() ───> fichier local
```

Le dashboard ne lance pas une seconde lecture des opérations. Le même
`useFinancialOperations()` sert d’abord à déterminer son mode, puis ses
sélecteurs sont alimentés avec le résultat déjà en cache. La requête historique
du mois précédent utilisée uniquement pour les comparaisons est remplacée par
un résumé de la projection déjà chargée.

## Contrats à implémenter

### Événement de transfert compatible

```ts
type TransferCreatedPayload = {
  fromAccountId: string;
  toAccountId: string | null;
  externalDestination: string | null; // lecture legacy uniquement
  amount: MoneyDTO;                    // débit source
  destinationAmount?: MoneyDTO;        // crédit cible si autre devise
  note?: string | null;
};
```

Validation :

- nouvelle commande : `toAccountId` obligatoire et `externalDestination: null` ;
- ancien événement externe : accepté sans `destinationAmount` ;
- même devise : `destinationAmount` absent, ou strictement identique si présent ;
- devises différentes : `destinationAmount` obligatoire et dans la devise cible ;
- le débit et le crédit doivent rester des entiers sûrs ;
- la source et la cible doivent être actives et distinctes.

`TransferState.destinationAmount` reste optionnel. Le snapshot reste en version
4 : un cache existant sans ce champ se relit avec le fallback `amount`, et le
journal demeure la source de vérité.

### Projection d’activité

```ts
type CashFlowRole = "income" | "expense" | "neutral";

type FinancialOperation = {
  // champs existants
  merchant: string | null;
  destinationAmount: MoneyDTO | null;
  cashFlowRole: CashFlowRole;
  isLegacyExternal: boolean;
};
```

Helpers purs :

```ts
operationEffect(operation, accountId): "incoming" | "outgoing" | "neutral";
operationAmountForAccount(operation, accountId): MoneyDTO | null;
summarizeMonthlyActivity(input): MonthlyActivitySummary;
```

Le résumé retourne `received`, `spent`, `difference`, `uncategorizedSpent`,
`missingCurrencies` et `isPartial`. En vue globale il utilise les montants
convertis vers la devise de base ; en vue d’un compte, il utilise la valeur
native de ce côté du mouvement.

## Ordre d’implémentation

### T1 — Verrouiller le domaine avant l’interface (P1)

Modifier :

- `apps/web/src/domain/eventPayload.ts`
- `apps/web/src/domain/eventPayload.test.ts`
- `apps/web/src/domain/financialState.ts`
- `apps/web/src/domain/financialState.test.ts`
- `apps/web/src/pillars/state/index.ts`
- `apps/web/src/pillars/state/index.test.ts`

Travail :

1. Autoriser `destinationAmount` optionnel dans le validateur strict.
2. Rejouer le débit source et le crédit cible avec les montants adaptés.
3. Rendre `RecordTransferParams.toAccountId` obligatoire et supprimer
   `externalDestination` de l’API de commande.
4. Charger le contexte de devise dans `recordTransfer()` ; calculer le montant
   cible avec `convertUsingContext()` avant `appendEvent()`.
5. Valider les deux soldes et refuser une conversion absente sans écrire.
6. Conserver la lecture des anciens transferts externes.

Commit attendu : `feat(transfers): support explicit internal currency conversion`

### T2 — Unifier les règles d’activité (P1)

Modifier :

- `apps/web/src/domain/financialOperations.ts`
- `apps/web/src/domain/financialOperations.test.ts`
- `apps/web/src/analytics/operations.ts`
- `apps/web/src/analytics/operations.test.ts`
- `apps/web/src/analytics/dashboard.ts`
- `apps/web/src/analytics/dashboard.test.ts`

Travail :

1. Projeter `merchant`, `destinationAmount`, `cashFlowRole` et
   `isLegacyExternal`.
2. Classer un ancien transfert externe en dépense non classée tout en gardant
   `kind: "transfer"` pour la traçabilité.
3. Implémenter les deux helpers compte/effet et le résumé mensuel.
4. Faire consommer les opérations à la chronologie de flux et à la répartition
   par catégorie ; ajouter le groupe virtuel « Non classé ».
5. Faire inclure les anciens transferts externes par le filtre « Dépenses », et
   réserver « Transferts » aux mouvements internes.
6. Arrêter la période courante à `min(periodEnd, asOfTimestamp)`.

Commit attendu : `feat(activity): centralize monthly cash-flow semantics`

### T3 — Clarifier Capture sans ajouter un long formulaire (P1)

Modifier :

- `apps/web/src/ui/Capture/index.tsx`
- `apps/web/src/locales/fr.json`
- `apps/web/src/locales/en.json`

Travail :

1. Garder l’entrée rapide « envoyer ou déplacer », puis demander le type de
   destination : compte WiseMoney ou destination extérieure.
2. Branche interne : compte source, compte cible, montant source et aperçu du
   montant crédité ; afficher le taux local utilisé si les devises diffèrent.
3. Si le taux manque, afficher une explication et un lien vers les devises ; ne
   pas soumettre.
4. Branche extérieure : destinataire, catégorie, montant et note, puis appeler
   `recordTransaction({ direction: "expense", merchant })`.
5. Employer « Déplacer entre mes comptes » et « Enregistrer la dépense » selon
   la branche ; ne pas présenter une sortie externe comme un transfert.
6. Réinitialiser correctement les champs lors d’un changement de branche.

Vérifier 320, 360 et 390 px, clavier ouvert, thème clair et sombre. Aucun nouveau
dialogue ou écran intermédiaire n’est ajouté.

Commit attendu : `feat(capture): route money movements by destination`

### T4 — Rendre le dashboard plus narratif, sans le remplacer (P1)

Modifier :

- `apps/web/src/hooks/useFinancialState.ts`
- `apps/web/src/ui/Dashboard/dashboardMode.ts`
- `apps/web/src/ui/Dashboard/dashboardMode.test.ts`
- `apps/web/src/ui/Dashboard/index.tsx`

Travail :

1. Déterminer le mode actif par la présence d’une `FinancialOperation`, afin
   qu’un premier transfert interne compte comme première activité.
2. Partager la requête d’opérations entre la décision de mode et le contenu.
3. Alimenter Reçu, Dépensé, Différence, courbe et catégories avec les sélecteurs
   communs, en gardant le snapshot pour les soldes et engagements.
4. Conserver l’ordre et toutes les cartes existantes ; rapprocher uniquement la
   courbe et les trois chiffres dans le bloc de situation déjà présent.
5. Ajouter « Voir l’activité du mois » avec `start`, `end` et `accountId`.
6. Pour « solde initial + dépense + aucun revenu », afficher une phrase neutre,
   non modale et fermable, sans rouge ni orange.
7. Garder modification/suppression, actions rapides, mois historiques, budgets,
   objectifs, engagements et Assistant financier accessibles.

Commit attendu : `feat(dashboard): explain monthly activity without alarm`

### T5 — Faire de `/operations` l’Activité du mois (P2)

Modifier :

- `apps/web/src/routes/operations.tsx`
- `apps/web/src/routes/operations.test.ts`
- `apps/web/src/ui/Operations/index.tsx`
- `apps/web/src/locales/fr.json`
- `apps/web/src/locales/en.json`

Ajouter :

- `apps/web/src/exportImport/activity.ts`
- `apps/web/src/exportImport/activity.test.ts`

Travail :

1. Utiliser le mois courant par défaut et reprendre le contexte reçu du
   dashboard.
2. Afficher Reçu/Dépensé/Différence depuis le contexte complet.
3. Garder la recherche visible ; déplacer type, catégorie et dates avancées dans
   « Filtrer ».
4. Faire de `start/end/accountId` le contexte des totaux, de la courbe et de
   l’export ; `q/kind/categoryId` ne filtrent que la liste.
5. Afficher un transfert multidevise avec le montant pertinent pour le compte
   sélectionné ; une seule ligne neutre en vue globale.
6. Ajouter CSV et XLSX locaux, bilingues, protégés contre les formules de tableur
   et basés sur toutes les opérations du contexte, pas seulement les lignes
   visibles.
7. Conserver les groupes de jours, le chargement par 100 et le panneau de détail.

Commit attendu : `feat(activity): add monthly context and local exports`

### T6 — Non-régression PWA et finition (P1)

Modifier :

- `apps/web/scripts/pwa-smoke.mjs`
- `CHANGELOG.md`
- `apps/web/src/releases/releases.json`

Travail :

1. Ajouter un parcours coffre déverrouillé hors ligne jusqu’au dashboard et à
   `/operations` ; c’est une lacune déjà connue du smoke actuel.
2. Vérifier la navigation dashboard → activité → retour en navigateur et en mode
   installé.
3. Vérifier clair/sombre sur mobile sans figer une valeur CSS de couleur exacte.
4. Enrichir la note de version `1.0.0` sans créer `1.0.1`.

Commit attendu : `test(pwa): cover offline dashboard activity flow`

## Cas limites et comportement attendu

| Cas | Résultat |
|---|---|
| Compte source XOF → compte cible XOF | Débit/crédit identiques, global neutre |
| Compte source XOF → compte cible EUR avec taux direct | Deux montants persistés, global neutre |
| Taux inverse uniquement | Conversion exacte via le modèle existant |
| Aucun taux | Erreur actionnable, zéro événement, zéro solde modifié |
| Taux changé après transfert | Historique et soldes passés inchangés |
| Destination extérieure | Transaction de dépense avec destinataire et catégorie |
| Ancien transfert externe | Sortie non classée, rejouable, jamais dans « Transferts » |
| Première opération = transfert interne | Dashboard actif |
| Solde initial puis dépense | Message descriptif, aucune alerte alarmante |
| Conversion d’affichage manquante | Résumé partiel signalé et devises listées |
| Export avec recherche active | Export du contexte complet, recherche ignorée |
| Export CSV contenant `=...` | Cellule neutralisée contre l’exécution de formule |

## Plan de tests

```text
CODE PATHS                                             USER FLOWS
[~] eventPayload / financialState                     [~] Envoyer ou déplacer
 ├─ [★★ existant] transfert même devise                ├─ [GAP → E2E] compte interne même devise
 ├─ [GAP CRITICAL] destinationAmount multidevise       ├─ [GAP → E2E] compte interne autre devise
 ├─ [GAP CRITICAL] taux absent = aucune écriture       ├─ [GAP → E2E] taux absent puis ajout du taux
 └─ [GAP CRITICAL] replay ancien transfert externe     └─ [GAP → E2E] destination extérieure = dépense

[~] projection / analytics                            [~] Comprendre le mois
 ├─ [GAP] merchant + rôle + montant cible              ├─ [GAP → E2E] solde initial puis dépense
 ├─ [GAP] résumé global/compte/multidevise             ├─ [GAP → E2E] dashboard → activité contextualisée
 ├─ [GAP] ancien externe = non classé                  └─ [GAP → E2E] premier mouvement interne
 └─ [GAP] période courante arrêtée à aujourd’hui

[+] `/operations` existant                            [~] Exporter et relire
 ├─ [★★ existant] recherche, filtres, groupes          ├─ [GAP] CSV FR/EN et neutralisation formule
 ├─ [★★ existant] pagination et détail                 ├─ [GAP] XLSX FR/EN, montants source/cible
 └─ [GAP] contexte distinct des filtres de liste       └─ [GAP → E2E] export hors ligne

[+] PWA / thèmes                                      [~] Utilisation mobile
 ├─ [★ existant] pages publiques hors ligne            ├─ [GAP CRITICAL] coffre → dashboard hors ligne
 └─ [GAP] dashboard/activité déverrouillés hors ligne  └─ [GAP] 320/360/390 px clair + sombre
```

Légende : ★★★ comportement + bords + erreurs ; ★★ happy path ; ★ smoke.

Tests unitaires obligatoires :

- payload nouveau/legacy, devises identiques/différentes et payload incohérent ;
- calcul direct/inverse, arrondi et dépassement d’entier sûr ;
- atomicité logique : aucun append si taux ou compte manque ;
- projection merchant/montant cible et lecture des anciens journaux ;
- résumé global, par compte, partiel et « Non classé » ;
- effet et montant des deux côtés d’un transfert multidevise ;
- recherche et filtres avec destinataire externe ;
- export CSV/XLSX FR/EN, contenu complet et protection formule ;
- mode dashboard après première opération interne.

Smokes obligatoires :

- Capture interne/externe sur 360 px et desktop ;
- dashboard sans revenu mensuel, sans orange/rouge ;
- lien dashboard → activité avec période/compte ;
- navigation, édition et suppression toujours disponibles ;
- coffre déjà créé et déverrouillé, passage hors ligne, rechargement dashboard et
  activité ;
- thèmes clair/sombre et application installée.

## Performance et confidentialité

- aucune requête réseau ni télémétrie ;
- aucune nouvelle boucle de polling ;
- une seule projection complète mise en cache par coffre, réutilisée entre
  dashboard et activité ;
- résumés et groupes calculés dans des `useMemo` sur une projection stable ;
- liste toujours limitée à 100 lignes rendues à la fois ;
- XLSX chargé et généré seulement au clic ;
- un fixture de 10 000 opérations vérifie que les sélecteurs restent linéaires
  et que l’export ne tronque pas silencieusement ;
- les exports restent locaux et contiennent des données en clair : reprendre
  l’avertissement de sécurité déjà utilisé pour les exports lisibles.

## Validation avant livraison

Dans cet ordre :

1. tests ciblés après chaque tâche ;
2. `pnpm --filter @wisemoney/web test` ;
3. `pnpm --filter @wisemoney/web typecheck` ;
4. `pnpm --filter @wisemoney/web lint` ;
5. `pnpm --filter @wisemoney/web build` ;
6. smoke PWA en ligne puis hors ligne ;
7. inspection mobile 320/360/390 px et desktop, clair/sombre ;
8. `git diff --check` ;
9. canary de production après push, sans erreur console.

La livraison est bloquée si une fonction actuelle du dashboard disparaît, si un
ancien journal ne se rejoue plus, si un transfert multidevise dépend du taux
courant au lieu du montant persisté, ou si les trois surfaces donnent des totaux
différents.

## Hors périmètre

- rapprochement bancaire automatique ;
- import de relevés bancaires ;
- synchronisation bancaire ou mobile money ;
- taux de change téléchargés automatiquement ;
- saisie manuelle d’un taux spécifique uniquement pour un transfert ;
- nouvelle navigation principale ;
- refonte générale de Capture ou du dashboard ;
- modification des sauvegardes et exports complets des Paramètres.

## Ordonnancement et parallélisation

T1 est séquentiel et bloque tout le reste. Après T1, T2 reste le contrat commun.
T3 et la partie visuelle de T5 peuvent ensuite avancer en parallèle, mais T4
attend T2. T6 vient après intégration.

```text
T1 domaine ─> T2 projection ─┬─> T3 Capture ──────┐
                             ├─> T4 Dashboard ────┼─> T6 validation
                             └─> T5 Activité/export┘
```

## Synthèse de l’engineering review

- Scope Challenge : périmètre réduit aux décisions convenues ; architecture
  existante réutilisée malgré le nombre de fichiers imposé par tests et i18n.
- Architecture Review : 1 ambiguïté trouvée puis résolue — transfert
  multidevise avec deux montants persistés.
- Code Quality Review : contrats purs, compatibilité legacy explicite, aucun
  nouveau service ni duplication de source de vérité.
- Test Review : 18 gaps recensés, dont 4 régressions/chemins critiques.
- Performance Review : cache d’opérations partagé, calculs linéaires, pagination
  et chargement XLSX à la demande.
- Échecs critiques couverts : taux absent, journal legacy, divergence de totaux,
  hors-ligne déverrouillé.
- Revue indépendante du design : 9/10 avant résolution du dernier point.
- Lake Score : 5/5 décisions choisissent la version complète dans le périmètre.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & stratégie | 0 | — | Non requis après cadrage produit ciblé |
| Codex Review | `/codex review` | Second avis indépendant | 1 | CLEAR | Design 9/10 ; dernier bord multidevise résolu |
| Eng Review | `/plan-eng-review` | Architecture & tests | 1 | CLEAR | Contrats, compatibilité, 18 gaps de tests et ordre des commits verrouillés |
| Design Review | `/plan-design-review` | UI/UX | 0 | — | Les critères mobile et dual-theme sont intégrés au plan |
| DX Review | `/plan-devex-review` | Expérience développeur | 0 | — | Hors périmètre |

- **CODEX:** la revue indépendante a confirmé la préservation du dashboard et a fait expliciter les transferts multidevises.
- **VERDICT:** ENG CLEARED — implémenté dans le périmètre approuvé et prêt pour la validation de livraison.

NO UNRESOLVED DECISIONS

## Validation de livraison

- Vitest : 52 fichiers, 448 tests passés ;
- TypeScript et ESLint : passés sans erreur ni avertissement ;
- build PWA InjectManifest : passé, 35 ressources précachées ;
- smoke compilé : parcours dashboard/Activité, transferts, CSV/XLSX,
  responsive, thème sombre et hors-ligne passés ;
- version conservée : `1.0.0`.
