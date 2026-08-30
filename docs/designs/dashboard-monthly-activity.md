# Design : dashboard mensuel et activité compréhensible

Généré le 2026-08-30
Branche : `main`
Dépôt : `Y4NN777/wisemoney`
Statut : APPROVED
Mode : produit existant, cadrage ciblé

## Problème

Le dashboard affiche les bons objets financiers, mais sa hiérarchie oblige
l’utilisateur à interpréter trop de cartes et de signaux avant de répondre à
trois questions simples :

1. Combien ai-je maintenant ?
2. Que s’est-il passé ce mois-ci ?
3. Où est parti l’argent ?

La confusion est plus forte lorsqu’un compte commence avec un solde initial,
puis enregistre une dépense avant tout revenu. Une différence mensuelle négative
peut alors sembler alarmante alors qu’elle signifie seulement que l’utilisateur
a utilisé une partie de son argent déjà disponible.

La page `/operations` contient déjà l’historique unifié, les totaux et les
filtres, mais elle ressemble d’abord à un écran de recherche. Elle ne joue pas
encore pleinement le rôle simple de « l’activité du mois » et ne permet pas
d’exporter la période consultée.

Enfin, le formulaire actuel accepte une destination externe dans un
`transfer_created`. Cette sortie diminue le compte source sans être comptée
comme dépense mensuelle. Cela contredit la règle métier retenue.

## Décisions produit

### 1. Une destination détermine la nature du mouvement

```text
L’utilisateur déplace ou envoie de l’argent
                    |
                    v
          Quelle est la destination ?
             /                    \
            /                      \
Compte suivi dans WiseMoney      Personne, commerce ou compte non suivi
          |                                      |
          v                                      v
Transfert interne                        Dépense catégorisée
`transfer_created`                       `transaction_created`
          |                                      |
Débit source + crédit cible              Débit du compte source
Neutre dans le total global              Comptée dans le mois et le budget
```

WiseMoney ne tente pas de rapprocher deux transactions par ressemblance de
montant ou de date. Le choix explicite de la destination suffit et reste
déterministe.

- Un **transfert** relie uniquement deux comptes actifs suivis dans WiseMoney,
  y compris lorsque leurs devises diffèrent.
- Une somme envoyée à une personne, un commerce ou un compte non suivi est une
  **dépense**.
- Le destinataire externe est conservé dans le champ `merchant` de la transaction.
- Une dépense conserve une catégorie, donc elle alimente les agrégations et le
  budget correspondant.

Cette règle est verrouillée dans le service, pas seulement dans l’interface :
`RecordTransferParams.toAccountId` devient obligatoire et la commande de création
ne reçoit plus `externalDestination`. Les validateurs et le replay continuent
d’accepter l’ancien payload pour la compatibilité des journaux et imports.

Pour un transfert multidevise, WiseMoney utilise le modèle de conversion local
déjà configuré. L’événement conserve deux valeurs immuables : `amount`, débité
dans la devise source, et `destinationAmount`, crédité dans la devise cible. Le
second montant est calculé avec `convertUsingContext()` au moment de la commande ;
une modification ultérieure du taux ne réécrit donc jamais l’historique.

`destinationAmount` reste optionnel dans le payload afin que les anciens
transferts de même devise continuent à être rejoués sans migration. Il devient
obligatoire et doit correspondre à la devise du compte cible lorsque les deux
comptes ont des devises différentes. Si aucun taux direct ou inverse n’existe,
la commande échoue sans écrire d’événement et l’interface propose d’ajouter le
taux manquant. Elle ne requalifie jamais ce mouvement interne en dépense.

Le flux Capture conserve un seul geste « envoyer ou déplacer » :

```text
Source -> Destination
             |
             +-- Compte WiseMoney
             |      -> montant source + aperçu converti + note
             |      -> recordTransfer({ fromAccountId, toAccountId, amount })
             |         calcule et persiste destinationAmount si nécessaire
             |
             +-- Personne / commerce / compte non suivi
                    -> destinataire + catégorie + montant + note
                    -> recordTransaction({ direction: "expense", merchant })
```

Le libellé du bouton et le message de réussite reflètent la branche choisie :
« Déplacer entre mes comptes » pour l’interne, « Enregistrer la dépense » pour
l’externe.

### 2. Les anciens transferts externes restent compréhensibles

Les journaux existants peuvent contenir des `transfer_created` avec
`externalDestination`. Leur replay reste accepté pour préserver les données.
Dans les projections de lecture, ils deviennent des sorties externes :

- incluses dans les dépenses et la différence du mois ;
- affichées comme « Sortie externe non classée » dans l’activité ;
- exclues des budgets faute de catégorie historique ;
- regroupées dans « Non classé » lorsque la répartition doit se réconcilier avec
  le total des dépenses.

Aucune migration destructive du journal n’est nécessaire.

Ils conservent `kind: "transfer"` pour que leur origine historique reste
traçable, mais reçoivent `cashFlowRole: "expense"` et
`isLegacyExternal: true`. Le filtre utilisateur « Dépenses » les inclut ; le
filtre « Transferts » ne montre que les mouvements internes. Cette règle de
présentation vit dans un sélecteur explicite, pas dans une comparaison de texte.

### 3. Le dashboard raconte d’abord le mois

Ordre cible :

```text
[Bonjour]                         [Compte] [Mois]

┌───────────────────────────────────────────────┐
│ Argent disponible              145 000 F      │
│                                               │
│        évolution du solde pendant le mois     │
│  ───────╮        ╭───────╮                    │
│         ╰────────╯       ╰────                │
│                                               │
│ Reçu          Dépensé          Différence     │
│ 100 000 F     40 000 F         +60 000 F      │
│                                               │
│ [Voir l’activité du mois]                     │
└───────────────────────────────────────────────┘

[Actions rapides]

[Explication contextuelle, seulement si utile]

[Dépenses par catégorie]   [Budgets et objectifs]
[À venir]                  [À regarder]
[Activité récente]
```

La ligne d’évolution du solde est le premier graphique. Les trois agrégations
du mois utilisent la même période et le même compte que cette ligne.

### 4. Le ton reste descriptif

Cas sans revenu du mois et avec dépense :

> Vous avez utilisé une partie de votre solde de départ. Aucun revenu n’a encore
> été enregistré ce mois-ci.

Ce message est informatif, non modal et fermable. Il ne prend ni le rouge ni
l’orange. Il disparaît lorsque la situation change et ne concurrence pas une
erreur ou un dialogue actif.

Sa fermeture réutilise le store d’attention existant avec un identifiant stable
par mois et par compte. Le message est rendu dans la narration mensuelle, pas
dans l’enveloppe visuelle orange de `DashboardAttention`.

Les couleurs d’alerte restent réservées à une action réellement utile : budget
proche de sa limite, budget dépassé ou taux de change manquant.

## Vue Activité du mois

La route `/operations` est conservée. Elle devient l’écran détaillé ouvert par
« Voir l’activité du mois ».

```text
Activité                       Août 2026
Tous les comptes                        [Exporter]

Reçu              Dépensé              Différence
100 000 F          40 000 F             +60 000 F

[Rechercher]                            [Filtrer]

30 août
−5 000 F   Carburant · Portefeuille
↔2 000 F   Portefeuille → Mobile Money

29 août
+100 000 F Salaire · Compte bancaire
```

Principes :

- le mois et le compte arrivent depuis le dashboard ;
- la recherche reste visible ;
- type, catégorie et dates avancées sont regroupés dans un panneau « Filtrer » ;
- un transfert interne apparaît une seule fois dans la vue globale ;
- dans la vue d’un compte, il apparaît comme sortie ou entrée de ce compte sans
  devenir revenu ou dépense ;
- les groupes quotidiens et le chargement progressif existants sont conservés ;
- le détail d’une opération reste dans le panneau latéral existant.

Le mois, le compte et la période personnalisée éventuelle forment le **contexte
d’activité**. Ils pilotent les trois agrégations, la courbe et l’export. Tant que
les dates avancées ne sont pas modifiées, le contexte reste le mois sélectionné ;
si elles le sont, elles remplacent explicitement ses bornes. La recherche, le
type et la catégorie filtrent seulement la liste détaillée : ils ne font pas
bouger les totaux principaux pendant que l’utilisateur cherche une ligne.

L’effet relatif d’une opération est calculé par un helper pur :

```ts
operationEffect(operation, accountId): "incoming" | "outgoing" | "neutral"
```

Dans la vue globale, un transfert interne est neutre. Dans la vue du compte
source il est sortant avec `amount`, et dans celle du compte cible il est entrant
avec `destinationAmount ?? amount`, sans devenir un revenu ou une dépense. Un
helper pur `operationAmountForAccount()` centralise ce choix afin que la liste,
les sous-totaux et l’export ne divergent pas.

## Export de l’activité

L’export porte sur tout le contexte mois/compte, pas seulement sur les 100 lignes
actuellement rendues et pas seulement sur le résultat d’une recherche textuelle.

Formats :

- CSV pour la compatibilité et les traitements simples ;
- XLSX pour un relevé lisible avec une feuille « Activité ».

Colonnes communes : date, type affiché, compte source, compte destination ou
destinataire, catégorie, description, montant source, devise source, montant
destination éventuel, devise destination éventuelle et effet relatif au compte
(`entrée`, `sortie`, `neutre`). Si une conversion d’affichage est disponible,
des colonnes séparées la portent ; elles ne remplacent jamais les valeurs
enregistrées. Le transfert interne n’est exporté qu’une fois dans la vue globale.

L’export est généré localement à partir des opérations déjà déchiffrées via de
nouveaux helpers `exportActivityCSV()` et `exportActivityXLSX()`. Il ne modifie
ni les exports complets des Paramètres, ni le backup, ni la clôture de cycle.
Les helpers reçoivent la langue active et produisent des en-têtes, types et
effets utilisateur en français ou en anglais. Les nombres, devises et montants
d’origine restent des valeurs structurées et ne sont jamais remplacés par une
traduction ou un montant converti.

## Architecture retenue

Réutiliser les projections et composants actuels avec un résumé mensuel pur :

```text
Journal chiffré
      |
      v
readFinancialOperationsInRange()
      |
      v
FinancialOperation[]
      |
      +--> filterFinancialOperations() --> activité affichée
      |
      +--> summarizeMonthlyActivity() --> reçu / dépensé / différence
      |                                      |
      |                                      +--> dashboard
      |                                      +--> en-tête Activité
      |
      +--> selectActivityContext() ----> export CSV/XLSX
      |
      +--> selectBalanceTimeline() ----> ligne du dashboard
```

`summarizeMonthlyActivity()` applique une seule fois les règles :

- revenu et récurrence de revenu : entrée ;
- dépense, dépense prévue réalisée et récurrence de dépense : sortie ;
- ancien transfert externe : sortie non classée ;
- transfert interne et contribution d’objectif : neutres dans reçu/dépensé.

Contrat minimal :

```ts
type MonthlyActivitySummary = {
  received: MoneyDTO;
  spent: MoneyDTO;
  difference: MoneyDTO;
  uncategorizedSpent: MoneyDTO;
  missingCurrencies: string[];
  isPartial: boolean;
};

summarizeMonthlyActivity({
  operations,
  start,
  end,
  accountId,
  displayCurrency,
}): MonthlyActivitySummary;
```

En vue globale, les montants sont convertis vers la devise de base. En vue d’un
compte, la devise native de ce compte est utilisée. Une conversion manquante ne
disparaît pas silencieusement : `isPartial` devient vrai, les devises manquantes
sont affichées et l’action mène aux taux de change.

Pour le mois courant, la borne effective est
`min(periodEnd, asOfTimestamp)` : la courbe et les agrégations s’arrêtent à
aujourd’hui au lieu de prolonger artificiellement le solde jusqu’à la fin du
mois. Pour un mois historique, la période complète reste disponible.

`FinancialOperation` expose aussi `merchant`, `cashFlowRole`,
`isLegacyExternal` et `destinationAmount`. `merchant` est projeté depuis les
transactions puis utilisé par le titre, la recherche, le détail et l’export.

Le snapshot financier reste l’autorité pour les soldes, budgets, objectifs et
engagements. Toutes les surfaces décrivant l’activité du mois — agrégations,
message contextuel, répartition, sous-totaux et export — consomment en revanche
la même projection d’activité. Le dashboard ne mélange donc pas des totaux issus
de deux règles différentes.

La répartition par catégorie est elle aussi dérivée des opérations. Une ancienne
sortie externe sans catégorie alimente explicitement « Non classé », ce qui
garantit que la somme des catégories se réconcilie avec les dépenses affichées.

## Préservation du dashboard actuel

La modification déplace et reconnecte des éléments existants ; elle ne supprime
aucune capacité :

- navigation par mois et filtre de compte conservés ;
- actions rapides conservées ;
- graphique de solde existant réutilisé ;
- budgets, objectifs, engagements, répartition par compte et activité récente
  conservés ;
- modification et suppression de transaction conservées ;
- états de chargement, erreur, reprise et consultation historique conservés ;
- comportement offline et thèmes clair/sombre conservés.

Chaque déplacement visuel doit être accompagné d’un test ou d’un smoke check
qui prouve que l’action reste accessible.

Le passage du dashboard d’un mode de guidance au mode actif repose sur la
présence d’au moins une `FinancialOperation`, pas seulement d’une transaction.
Un transfert interne comme premier mouvement ouvre donc bien le dashboard actif.

## Approches écartées

- **Réorganisation visuelle seulement** : rejetée car elle laisserait les
  sorties externes absentes des dépenses mensuelles.
- **Rapprochement automatique par montant et date** : rejeté car deux opérations
  légitimes peuvent se ressembler ; une mauvaise fusion ferait perdre la
  confiance dans les comptes.
- **Réécriture du moteur financier** : rejetée car les projections actuelles
  fournissent déjà les données nécessaires.

## États à couvrir

- aucun compte : guidance actuelle de création ;
- compte sans mouvement : guidance vers la première opération ;
- transfert interne comme premier mouvement ;
- solde initial puis première dépense sans revenu ;
- revenus uniquement, dépenses uniquement ou différence nulle ;
- transfert interne global et filtré par chacun de ses comptes ;
- ancienne sortie externe sans catégorie ;
- plusieurs devises avec et sans taux disponible ;
- transfert multidevise avec taux direct, taux inverse et arrondi ;
- tentative de transfert multidevise sans taux disponible ;
- mois vide et mois historique ;
- chargement, projection indisponible et reprise ;
- thème clair et sombre, téléphone 320/360/390 px et ordinateur.

## Critères de réussite

- L’utilisateur peut expliquer la différence entre solde et activité du mois à
  partir du premier écran sans ouvrir l’aide.
- Une première dépense depuis un solde initial ne déclenche aucun message
  alarmant.
- Toute nouvelle destination interne produit un transfert ; toute nouvelle
  destination externe produit une dépense catégorisée.
- Le dashboard, l’en-tête Activité et l’export donnent les mêmes agrégations pour
  une période et un compte identiques ; modifier les dates avancées met à jour
  ces trois surfaces ensemble.
- L’activité détaillée reste accessible en un clic depuis le dashboard.
- CSV et XLSX contiennent toutes les opérations du contexte mois/compte et sont
  générés hors ligne.
- Aucun changement de serveur, de backup ou de modèle de consentement.

## Hors périmètre

- rapprochement bancaire automatique ;
- import de relevés bancaires ;
- synchronisation avec une banque ou un service de mobile money ;
- nouvelle navigation principale ;
- modification du calcul des budgets et objectifs hors prise en compte normale
  des nouvelles dépenses ;
- refonte générale de la page Capture au-delà du choix de destination.

## Prochaine étape

Exécuter le plan d’implémentation revu par l’ingénierie, par petits commits
réversibles, sans supprimer ni remplacer les capacités actuelles du dashboard.
