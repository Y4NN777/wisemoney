export type HelpLocale = "en" | "fr";

export const HELP_KNOWLEDGE_VERSION = "1.0.0-2026-08-29";

export const HELP_SURFACES = [
  "landing", "onboarding", "restore", "unlock", "dashboard", "capture", "operations",
  "planning", "budgets", "goals", "planned-expenses", "recurring", "debts", "settings",
  "help", "assistant", "updates", "global",
] as const;

export type SurfaceId = typeof HELP_SURFACES[number];

export type ProductTask = {
  id: string;
  groupId: string;
  locale: HelpLocale;
  title: string;
  summary: string;
  route: string | null;
  prerequisites: string[];
  steps: string[];
  expectedResult: string;
  aliases: string[];
  surfaces: SurfaceId[];
  limitations: string[];
  features: string[];
};

/** Backward-compatible name used by the help page and chat components. */
export type HelpSection = ProductTask;

const fr: ProductTask[] = [
  {
    id: "demarrage", groupId: "acces", locale: "fr", title: "Installer et créer votre espace", route: null,
    summary: "Installez WiseMoney si vous le souhaitez, puis créez l’espace privé qui protégera vos données sur cet appareil.",
    prerequisites: [],
    steps: ["Depuis la présentation, choisissez Commencer.", "Parcourez les quatre repères puis choisissez Installer et créer mon espace.", "Installez WiseMoney depuis le bouton proposé ou continuez dans le navigateur.", "Créez votre phrase privée, confirmez-la puis choisissez Créer mon espace."],
    expectedResult: "WiseMoney ouvre votre tableau de bord privé sur cet appareil.",
    aliases: ["commencer", "première utilisation", "créer espace", "onboarding"], surfaces: ["landing", "onboarding"],
    limitations: ["WiseMoney ne peut pas récupérer une phrase privée oubliée."], features: ["onboarding", "vault"],
  },
  {
    id: "restauration", groupId: "acces", locale: "fr", title: "Restaurer un espace existant", route: null,
    summary: "Rouvrez vos données sur cet appareil à partir d’une sauvegarde chiffrée créée par WiseMoney.",
    prerequisites: ["Disposer du fichier de sauvegarde WiseMoney et de sa phrase de sauvegarde."],
    steps: ["Sur l’écran d’accès, choisissez Restaurer mon espace.", "Sélectionnez le fichier de sauvegarde WiseMoney.", "Saisissez la phrase utilisée lors de cette sauvegarde.", "Choisissez une phrase privée pour protéger l’espace sur ce nouvel appareil, puis confirmez."],
    expectedResult: "Les données de la sauvegarde sont importées et le nouvel espace s’ouvre.",
    aliases: ["importer compte", "fichier export", "récupérer données", "changer téléphone"], surfaces: ["restore", "landing"],
    limitations: ["Un relevé Excel ou un calendrier ne peut pas restaurer l’espace."], features: ["backup", "import"],
  },
  {
    id: "phrase-privee", groupId: "acces", locale: "fr", title: "Ouvrir avec la phrase privée ou l’appareil", route: null,
    summary: "La phrase privée reste la clé de secours ; le visage, l’empreinte ou le code de l’appareil peuvent accélérer l’ouverture.",
    prerequisites: ["Avoir déjà créé un espace WiseMoney."],
    steps: ["Choisissez Ouvrir mon espace.", "Utilisez le déverrouillage de l’appareil s’il a été configuré.", "Sinon, choisissez Utiliser la phrase privée, saisissez-la puis ouvrez l’espace."],
    expectedResult: "Le coffre est déverrouillé localement.",
    aliases: ["mot de passe", "empreinte", "visage", "pin", "webauthn", "déverrouiller"], surfaces: ["landing", "unlock"],
    limitations: ["Les options biométriques dépendent du navigateur et de l’appareil."], features: ["passphrase", "device-unlock"],
  },
  {
    id: "installation", groupId: "acces", locale: "fr", title: "Installer WiseMoney sur cet appareil", route: null,
    summary: "Ajoutez WiseMoney à l’écran d’accueil pour l’ouvrir comme vos autres applications.",
    prerequisites: ["Ouvrir WiseMoney dans un navigateur compatible."],
    steps: ["Android : ouvrez le menu de Chrome puis choisissez Installer l’application ou Ajouter à l’écran d’accueil.", "iPhone ou iPad : dans Safari, touchez Partager puis Sur l’écran d’accueil.", "Ordinateur : utilisez l’icône d’installation dans la barre d’adresse ou le menu du navigateur."],
    expectedResult: "L’icône WiseMoney apparaît parmi les applications de l’appareil.",
    aliases: ["pwa", "android", "iphone", "ios", "écran accueil", "application"], surfaces: ["landing", "onboarding", "help"],
    limitations: ["Le bouton exact dépend du navigateur ; l’installation n’utilise pas une boutique."], features: ["pwa-install"],
  },
  {
    id: "comptes", groupId: "suivi", locale: "fr", title: "Créer et gérer un compte", route: "/capture?tab=manage&section=accounts",
    summary: "Séparez espèces, mobile money, banque et carte pour conserver des soldes lisibles.",
    prerequisites: ["Avoir ouvert l’espace privé."],
    steps: ["Ouvrez Saisie.", "Choisissez Gérer puis Comptes.", "Choisissez Ajouter un compte, renseignez son nom, son type, sa devise et son solde initial, puis enregistrez.", "Utilisez l’icône crayon pour le modifier ou la corbeille pour l’archiver."],
    expectedResult: "Le compte actif devient disponible dans les saisies et le tableau de bord.",
    aliases: ["espèces", "mobile money", "banque", "carte", "solde initial"], surfaces: ["capture", "dashboard"],
    limitations: ["Archiver conserve l’historique ; cela ne supprime pas les anciennes opérations."], features: ["accounts"],
  },
  {
    id: "categories", groupId: "suivi", locale: "fr", title: "Créer et organiser les catégories", route: "/capture?tab=manage&section=categories",
    summary: "Utilisez des catégories pour comprendre où va l’argent et suivre les budgets.",
    prerequisites: ["Avoir ouvert l’espace privé."],
    steps: ["Ouvrez Saisie puis Gérer.", "Choisissez Catégories puis Ajouter une catégorie.", "Saisissez un nom et enregistrez.", "Renommez ou archivez une catégorie depuis sa ligne."],
    expectedResult: "La catégorie est proposée pour les transactions, budgets et éléments planifiés.",
    aliases: ["classement", "type dépense", "renommer catégorie"], surfaces: ["capture", "budgets"],
    limitations: ["Une catégorie utilisée par un élément actif peut devoir rester disponible."], features: ["categories"],
  },
  {
    id: "transactions", groupId: "suivi", locale: "fr", title: "Enregistrer, corriger ou supprimer une transaction", route: "/capture?tab=transaction",
    summary: "Ajoutez un revenu ou une dépense puis retrouvez-le dans Activité.",
    prerequisites: ["Avoir au moins un compte actif."],
    steps: ["Ouvrez Saisie puis Transaction.", "Choisissez Revenu ou Dépense, le compte, la catégorie, le montant et la date.", "Choisissez Enregistrer.", "Pour corriger ou supprimer l’opération, ouvrez Activité depuis le tableau de bord puis sélectionnez sa ligne."],
    expectedResult: "Le solde du compte et les indicateurs de la période sont recalculés.",
    aliases: ["revenu", "dépense", "mouvement", "modifier opération", "historique"], surfaces: ["capture", "operations", "dashboard"],
    limitations: ["La suppression d’une transaction est définitive dans le cycle courant."], features: ["transactions"],
  },
  {
    id: "virements", groupId: "suivi", locale: "fr", title: "Transférer entre deux comptes et suivre le transfert", route: "/capture?tab=transfer",
    summary: "Déplacez de l’argent entre deux de vos comptes, même s’ils utilisent des devises différentes.",
    prerequisites: ["Avoir deux comptes actifs ; ajouter un taux de change local si leurs devises diffèrent."],
    steps: ["Ouvrez Saisie puis Envoyer ou déplacer de l’argent.", "Choisissez Vers un de mes comptes, puis les comptes source et destinataire.", "Saisissez le montant source et la note éventuelle ; vérifiez le montant reçu si une conversion est nécessaire.", "Choisissez Déplacer entre mes comptes, puis ouvrez Activité pour retrouver le mouvement."],
    expectedResult: "Le compte source est débité, le compte destinataire est crédité et le mouvement reste neutre dans l’activité globale.",
    aliases: ["transfert", "compte à compte", "changer de compte", "conversion", "suivre transfert"], surfaces: ["capture", "operations", "dashboard"],
    limitations: ["Sans taux disponible, WiseMoney ne peut pas enregistrer un mouvement entre deux devises différentes ; un transfert ne se modifie pas après enregistrement."], features: ["transfers"],
  },
  {
    id: "tableau-de-bord", groupId: "suivi", locale: "fr", title: "Lire le tableau de bord et l’activité", route: "/",
    summary: "Comparez le solde disponible, les revenus, les dépenses et la différence de la période choisie.",
    prerequisites: ["Avoir ouvert l’espace privé."],
    steps: ["Choisissez la période à analyser en haut du tableau de bord.", "Lisez le solde total comme l’argent disponible maintenant.", "Comparez revenus, dépenses et différence pour la période.", "Ouvrez Activité pour rechercher, filtrer ou exporter les mouvements du mois."],
    expectedResult: "Les indicateurs et graphiques correspondent à la période sélectionnée, tandis que le solde reste actuel.",
    aliases: ["dashboard", "activité", "graphiques", "solde total", "toutes opérations"], surfaces: ["dashboard", "operations"],
    limitations: ["Les comptes sans taux de change peuvent être exclus du total dans la devise principale."], features: ["dashboard", "period-comparison"],
  },
  {
    id: "budgets", groupId: "planification", locale: "fr", title: "Créer et suivre un budget", route: "/budgets",
    summary: "Fixez une limite par catégorie et suivez la part déjà consommée.",
    prerequisites: ["Avoir une catégorie active."],
    steps: ["Ouvrez Planification puis Budgets.", "Choisissez Ajouter un budget.", "Sélectionnez la catégorie, la période et la limite, puis enregistrez.", "Consultez la progression ; archivez le budget lorsqu’il n’est plus utile."],
    expectedResult: "Les dépenses de la catégorie alimentent automatiquement le pourcentage utilisé.",
    aliases: ["limite", "plafond", "pourcentage dépensé"], surfaces: ["planning", "budgets"],
    limitations: ["Créer un budget ne bloque pas une dépense."], features: ["budgets"],
  },
  {
    id: "objectifs", groupId: "planification", locale: "fr", title: "Créer un objectif et ajouter une contribution", route: "/goals",
    summary: "Définissez une cible d’épargne puis suivez chaque contribution.",
    prerequisites: ["Avoir ouvert l’espace privé."],
    steps: ["Ouvrez Planification puis Objectifs.", "Choisissez Ajouter un objectif, indiquez son nom et sa cible, puis enregistrez.", "Pour contribuer, ouvrez Saisie puis Objectif, choisissez l’objectif et saisissez le montant."],
    expectedResult: "La progression de l’objectif augmente du montant contribué.",
    aliases: ["épargne", "cagnotte", "contribution", "montant cible"], surfaces: ["planning", "goals", "capture"],
    limitations: ["Une contribution suit la progression ; elle n’effectue pas un transfert bancaire réel."], features: ["goals"],
  },
  {
    id: "depenses-prevues", groupId: "planification", locale: "fr", title: "Préparer puis réaliser une dépense prévue", route: "/planned-expenses",
    summary: "Planifiez un achat ponctuel sans modifier les soldes avant sa réalisation.",
    prerequisites: ["Avoir un compte et une catégorie actifs pour réaliser la dépense."],
    steps: ["Ouvrez Planification puis Dépenses prévues.", "Ajoutez le libellé, l’estimation, la catégorie, la priorité et l’échéance.", "Modifiez ou annulez la dépense tant qu’elle reste en attente.", "Quand elle a lieu, choisissez Réaliser, puis indiquez le compte, le montant réel et la date."],
    expectedResult: "La dépense prévue est terminée et une transaction réelle apparaît dans l’activité.",
    aliases: ["achat futur", "ponctuel", "prévision", "réaliser dépense"], surfaces: ["planning", "planned-expenses"],
    limitations: ["Une dépense en attente ne change aucun solde."], features: ["planned-expenses"],
  },
  {
    id: "recurrent", groupId: "planification", locale: "fr", title: "Suivre un revenu ou paiement récurrent", route: "/recurring",
    summary: "Préparez une opération qui revient et réalisez chaque occurrence à son échéance.",
    prerequisites: ["Avoir un compte et une catégorie actifs."],
    steps: ["Ouvrez Planification puis Récurrents.", "Ajoutez le libellé, le sens, le compte, la catégorie, le montant, la fréquence et la prochaine date.", "À l’échéance, choisissez Réaliser pour enregistrer la transaction correspondante.", "Archivez l’élément lorsqu’il ne revient plus."],
    expectedResult: "La transaction est enregistrée et la prochaine échéance avance selon la fréquence.",
    aliases: ["abonnement", "salaire", "paiement mensuel", "occurrence"], surfaces: ["planning", "recurring"],
    limitations: ["WiseMoney n’exécute aucun paiement bancaire automatiquement."], features: ["recurring"],
  },
  {
    id: "dettes", groupId: "planification", locale: "fr", title: "Suivre une dette ou une créance", route: "/debts",
    summary: "Notez ce que vous devez ou ce que l’on vous doit, avec une échéance facultative.",
    prerequisites: ["Avoir ouvert l’espace privé."],
    steps: ["Ouvrez Planification puis Dettes et créances.", "Choisissez le type, renseignez la personne, le motif, le montant et l’échéance éventuelle.", "Modifiez l’échéance depuis la fiche ou ajoutez-la au calendrier.", "Marquez l’élément comme réglé quand le paiement est terminé."],
    expectedResult: "L’élément conserve son statut et son échéance jusqu’à son règlement.",
    aliases: ["prêt", "recevoir", "rembourser", "créance", "échéance"], surfaces: ["planning", "debts"],
    limitations: ["Marquer comme réglé ne crée pas automatiquement une transaction."], features: ["debts", "receivables"],
  },
  {
    id: "rappels", groupId: "organisation", locale: "fr", title: "Configurer les rappels et le calendrier", route: "/settings",
    summary: "Choisissez les échéances à rappeler sur cet appareil ou exportez-les vers votre calendrier.",
    prerequisites: ["Installer WiseMoney pour améliorer la fiabilité des notifications."],
    steps: ["Ouvrez Paramètres puis Rappels.", "Activez les rappels et les types utiles.", "Choisissez Autoriser les notifications système si vous les souhaitez.", "Utilisez Ajouter au calendrier sur une échéance ou exportez la revue hebdomadaire."],
    expectedResult: "Les rappels locaux sont préparés selon vos choix, sans montant dans leur texte.",
    aliases: ["notification", "son", "calendrier", "échéance", "revue hebdomadaire"], surfaces: ["settings", "planned-expenses", "recurring", "debts"],
    limitations: ["Le navigateur décide du moment exact des notifications en arrière-plan."], features: ["reminders", "calendar"],
  },
  {
    id: "devises", groupId: "reglages", locale: "fr", title: "Choisir la devise principale et les taux", route: "/settings",
    summary: "Convertissez les comptes de plusieurs devises avec des taux que vous contrôlez.",
    prerequisites: ["Avoir ouvert l’espace privé."],
    steps: ["Ouvrez Paramètres puis Argent et devises.", "Choisissez la devise principale.", "Ajoutez un taux entre les devises utilisées.", "Revenez au tableau de bord pour inclure les comptes convertibles dans le total."],
    expectedResult: "WiseMoney calcule les totaux avec les taux enregistrés localement.",
    aliases: ["monnaie", "fx", "taux change", "conversion"], surfaces: ["settings", "dashboard"],
    limitations: ["WiseMoney ne télécharge pas automatiquement les taux du marché."], features: ["currencies"],
  },
  {
    id: "sauvegarde", groupId: "reglages", locale: "fr", title: "Sauvegarder, exporter et recommencer", route: "/settings",
    summary: "Créez un fichier restaurable avant de changer d’appareil ou de clôturer un cycle.",
    prerequisites: ["Avoir ouvert l’espace privé."],
    steps: ["Ouvrez Paramètres puis Données et sauvegardes.", "Pour une restauration future, exportez une sauvegarde chiffrée et conservez sa phrase séparément.", "Utilisez les exports lisibles pour consulter les données, pas pour restaurer.", "Avant une remise à zéro, vérifiez la sauvegarde et le relevé produits par WiseMoney."],
    expectedResult: "Vous disposez d’une sauvegarde chiffrée restaurable et, si demandé, d’un relevé lisible.",
    aliases: ["backup", "export", "import", "xlsx", "reset", "réinitialiser", "cycle"], surfaces: ["settings", "restore"],
    limitations: ["Un fichier Excel n’est pas une sauvegarde restaurable."], features: ["backup", "import", "export", "cycle-reset"],
  },
  {
    id: "apparence", groupId: "reglages", locale: "fr", title: "Changer la langue, le thème et consulter les nouveautés", route: "/settings",
    summary: "Adaptez l’affichage sans modifier vos données financières.", prerequisites: [],
    steps: ["Ouvrez Paramètres.", "Choisissez Français ou English dans Langue.", "Choisissez Clair, Sombre ou Système dans Apparence.", "Dans À propos, ouvrez les nouveautés de la version actuelle."],
    expectedResult: "L’interface applique immédiatement vos préférences sur cet appareil.",
    aliases: ["dark mode", "mode sombre", "anglais", "français", "release notes", "version"], surfaces: ["settings", "updates"],
    limitations: [], features: ["appearance", "language", "updates"],
  },
  {
    id: "intelligence", groupId: "aide", locale: "fr", title: "Choisir entre WiseBot et l’Assistant financier", route: "/help",
    summary: "WiseBot explique l’application ; l’Assistant financier analyse vos informations seulement après votre accord.", prerequisites: [],
    steps: ["Demandez à WiseBot où trouver une fonction ou comment l’utiliser.", "Pour comprendre vos propres chiffres, ouvrez Assistant financier après déverrouillage.", "Vérifiez l’écran de consentement avant tout partage avec un service intelligent."],
    expectedResult: "Vous utilisez le bon assistant avec un périmètre clair.",
    aliases: ["ia", "chat", "conseil", "analyse", "prédiction", "gemma"], surfaces: ["help", "assistant", "global"],
    limitations: ["WiseBot ne voit ni l’écran ni le coffre et ne fournit pas de conseil financier personnalisé."], features: ["help-chat", "financial-assistant", "predictions", "recommendations"],
  },
  {
    id: "securite", groupId: "aide", locale: "fr", title: "Comprendre la sécurité et la confidentialité", route: "/help",
    summary: "Les données financières restent chiffrées sur l’appareil et les services en ligne sont séparés.", prerequisites: [],
    steps: ["Verrouillez WiseMoney après utilisation sur un appareil partagé.", "Gardez votre phrase privée et vos sauvegardes dans des endroits séparés.", "N’ajoutez une image à WiseBot que si vous souhaitez réellement l’envoyer."],
    expectedResult: "Les données restent locales tant que vous ne choisissez pas explicitement un envoi.",
    aliases: ["confidentialité", "chiffrement", "données", "consentement", "image"], surfaces: ["help", "settings", "global"],
    limitations: ["Une image ajoutée manuellement à WiseBot est envoyée au fournisseur après consentement."], features: ["privacy", "encryption", "consent"],
  },
  {
    id: "hors-ligne", groupId: "aide", locale: "fr", title: "Utiliser WiseMoney hors ligne et résoudre un blocage", route: "/help",
    summary: "Les fonctions locales et le guide restent disponibles ; WiseBot attend le retour d’Internet.", prerequisites: ["Avoir ouvert WiseMoney une première fois en ligne."],
    steps: ["Installez WiseMoney ou ouvrez-le une première fois en ligne pour mettre les fichiers essentiels en cache.", "Hors ligne, continuez les saisies, budgets et consultations locales.", "Si une page reste bloquée, choisissez Réessayer puis fermez et rouvrez WiseMoney.", "N’effacez pas les données du navigateur sans sauvegarde récente."],
    expectedResult: "L’application locale reprend dès que les fichiers et le stockage de l’appareil sont disponibles.",
    aliases: ["offline", "internet", "cache", "panne", "erreur", "dépannage"], surfaces: ["help", "global"],
    limitations: ["WiseBot et les services en ligne ont besoin d’une connexion."], features: ["offline", "troubleshooting"],
  },
];

type TranslatedTaskCopy = Pick<ProductTask, "title" | "summary" | "prerequisites" | "steps" | "expectedResult" | "aliases" | "limitations">;

const englishCopy: Record<string, TranslatedTaskCopy> = {
  "demarrage": { title: "Install and create your private space", summary: "Install WiseMoney if you want, then create the private space that protects data on this device.", prerequisites: [], steps: ["From the introduction, choose Start.", "Review the four cues, then choose Install and create my space.", "Install WiseMoney from the offered action or continue in the browser.", "Create and confirm your private passphrase, then choose Create my space."], expectedResult: "WiseMoney opens your private dashboard on this device.", aliases: ["start", "first use", "create space", "onboarding"], limitations: ["WiseMoney cannot recover a forgotten private passphrase."] },
  "restauration": { title: "Restore an existing space", summary: "Reopen your data on this device from an encrypted WiseMoney backup.", prerequisites: ["Have the WiseMoney backup file and its backup passphrase."], steps: ["On the access screen, choose Restore my space.", "Select the WiseMoney backup file.", "Enter the passphrase used for that backup.", "Choose a private passphrase for the new device, then confirm."], expectedResult: "The backup is imported and the restored space opens.", aliases: ["import account", "export file", "recover data", "new phone"], limitations: ["An Excel statement or calendar cannot restore the space."] },
  "phrase-privee": { title: "Open with your passphrase or device", summary: "The private passphrase remains the recovery key; face, fingerprint, or device PIN can make opening faster.", prerequisites: ["Have an existing WiseMoney space."], steps: ["Choose Open my space.", "Use device unlock if it is configured.", "Otherwise choose Use private passphrase, enter it, then open the space."], expectedResult: "The vault unlocks locally.", aliases: ["password", "fingerprint", "face", "pin", "webauthn", "unlock"], limitations: ["Biometric options depend on the browser and device."] },
  "installation": { title: "Install WiseMoney on this device", summary: "Add WiseMoney to the home screen and open it like your other apps.", prerequisites: ["Open WiseMoney in a compatible browser."], steps: ["Android: open Chrome’s menu, then choose Install app or Add to Home screen.", "iPhone or iPad: in Safari, tap Share, then Add to Home Screen.", "Computer: use the install icon in the address bar or browser menu."], expectedResult: "The WiseMoney icon appears with the device’s apps.", aliases: ["pwa", "android", "iphone", "ios", "home screen", "application"], limitations: ["The exact action depends on the browser; no app store is required."] },
  "comptes": { title: "Create and manage an account", summary: "Keep cash, mobile money, bank, and card balances separate and readable.", prerequisites: ["Open the private space."], steps: ["Open Capture.", "Choose Manage, then Accounts.", "Choose Add account, enter its name, type, currency, and opening balance, then save.", "Use the pencil to edit it or the trash action to archive it."], expectedResult: "The active account becomes available in capture and on the dashboard.", aliases: ["cash", "mobile money", "bank", "card", "opening balance"], limitations: ["Archiving keeps history and does not remove past operations."] },
  "categories": { title: "Create and organize categories", summary: "Use categories to understand spending and track budgets.", prerequisites: ["Open the private space."], steps: ["Open Capture, then Manage.", "Choose Categories, then Add category.", "Enter a name and save.", "Rename or archive a category from its row."], expectedResult: "The category is available for transactions, budgets, and planned items.", aliases: ["classification", "expense type", "rename category"], limitations: ["A category referenced by an active item may need to stay available."] },
  "transactions": { title: "Record, correct, or delete a transaction", summary: "Add income or an expense and find it again in Activity.", prerequisites: ["Have at least one active account."], steps: ["Open Capture, then Transaction.", "Choose Income or Expense, the account, category, amount, and date.", "Choose Save.", "To correct or delete it, open Activity from the dashboard and select its row."], expectedResult: "The account balance and period indicators are recalculated.", aliases: ["income", "expense", "movement", "edit operation", "history"], limitations: ["Deleting a transaction is permanent in the current cycle."] },
  "virements": { title: "Transfer between accounts and track it", summary: "Move money between two of your accounts, even when they use different currencies.", prerequisites: ["Have two active accounts; add a local exchange rate when their currencies differ."], steps: ["Open Capture, then Send or move money.", "Choose To one of my accounts, then choose the source and destination accounts.", "Enter the source amount and optional note; check the amount received when conversion is needed.", "Choose Move between my accounts, then open Activity to find the movement."], expectedResult: "The source account is debited, the destination account is credited, and the movement stays neutral in combined activity.", aliases: ["transfer", "account to account", "move money", "conversion", "track transfer"], limitations: ["Without an available rate, WiseMoney cannot record a movement between different currencies; a transfer cannot be edited after recording."] },
  "tableau-de-bord": { title: "Read the dashboard and activity", summary: "Compare available balance, income, expenses, and the difference for a selected period.", prerequisites: ["Open the private space."], steps: ["Choose the period at the top of the dashboard.", "Read total balance as money available now.", "Compare income, expenses, and difference for the period.", "Open Activity to search, filter, or export the month’s movements."], expectedResult: "Indicators and charts follow the selected period while total balance stays current.", aliases: ["dashboard", "activity", "charts", "total balance", "all operations"], limitations: ["Accounts without a usable exchange rate may be excluded from the base-currency total."] },
  "budgets": { title: "Create and follow a budget", summary: "Set a category limit and follow how much has been used.", prerequisites: ["Have an active category."], steps: ["Open Planning, then Budgets.", "Choose Add budget.", "Select the category, period, and limit, then save.", "Review progress and archive the budget when it is no longer useful."], expectedResult: "Category expenses automatically update the used percentage.", aliases: ["limit", "cap", "percentage spent"], limitations: ["A budget does not block an expense."] },
  "objectifs": { title: "Create a goal and add a contribution", summary: "Set a savings target and follow each contribution.", prerequisites: ["Open the private space."], steps: ["Open Planning, then Goals.", "Choose Add goal, enter its name and target, then save.", "To contribute, open Capture, then Goal, choose the goal, and enter the amount."], expectedResult: "Goal progress increases by the contribution amount.", aliases: ["saving", "fund", "contribution", "target amount"], limitations: ["A contribution tracks progress; it does not perform a real bank transfer."] },
  "depenses-prevues": { title: "Prepare and complete a planned expense", summary: "Plan a one-off purchase without changing balances before it happens.", prerequisites: ["Have an active account and category to complete the expense."], steps: ["Open Planning, then Planned expenses.", "Add the label, estimate, category, priority, and due date.", "Edit or cancel it while it is pending.", "When it happens, choose Complete and enter the account, actual amount, and date."], expectedResult: "The plan is completed and an actual transaction appears in activity.", aliases: ["future purchase", "one-off", "forecast", "complete expense"], limitations: ["A pending planned expense does not change any balance."] },
  "recurrent": { title: "Track recurring income or a payment", summary: "Prepare an operation that repeats and complete each occurrence when due.", prerequisites: ["Have an active account and category."], steps: ["Open Planning, then Recurring.", "Add the label, direction, account, category, amount, frequency, and next date.", "When due, choose Complete to record the matching transaction.", "Archive the item when it no longer repeats."], expectedResult: "The transaction is recorded and the next date advances by the frequency.", aliases: ["subscription", "salary", "monthly payment", "occurrence"], limitations: ["WiseMoney never executes a bank payment automatically."] },
  "dettes": { title: "Track a debt or receivable", summary: "Record what you owe or what someone owes you, with an optional due date.", prerequisites: ["Open the private space."], steps: ["Open Planning, then Debts & receivables.", "Choose the type and enter the person, purpose, amount, and optional due date.", "Edit the due date from the card or add it to your calendar.", "Mark the item settled when payment is complete."], expectedResult: "The item keeps its status and due date until settlement.", aliases: ["loan", "receive", "repay", "receivable", "due date"], limitations: ["Marking settled does not automatically create a transaction."] },
  "rappels": { title: "Configure reminders and calendar", summary: "Choose which due dates to surface on this device or export them to your calendar.", prerequisites: ["Install WiseMoney for more reliable notifications."], steps: ["Open Settings, then Reminders.", "Enable reminders and the useful types.", "Choose Allow system notifications if wanted.", "Use Add to calendar on a due item or export the weekly review."], expectedResult: "Local reminders are prepared without amounts in their text.", aliases: ["notification", "sound", "calendar", "due date", "weekly review"], limitations: ["The browser controls exact background delivery time."] },
  "devises": { title: "Choose the base currency and exchange rates", summary: "Convert accounts in several currencies using rates you control.", prerequisites: ["Open the private space."], steps: ["Open Settings, then Money & currencies.", "Choose the base currency.", "Add a rate between the currencies you use.", "Return to the dashboard to include convertible accounts in the total."], expectedResult: "WiseMoney calculates totals using locally saved rates.", aliases: ["currency", "fx", "exchange rate", "conversion"], limitations: ["WiseMoney does not download market rates automatically."] },
  "sauvegarde": { title: "Back up, export, and start a new cycle", summary: "Create a restorable file before moving devices or closing a cycle.", prerequisites: ["Open the private space."], steps: ["Open Settings, then Data & backups.", "For future restoration, export an encrypted backup and keep its passphrase separately.", "Use readable exports for review, not restoration.", "Before reset, verify the backup and statement created by WiseMoney."], expectedResult: "You have a restorable encrypted backup and, when requested, a readable statement.", aliases: ["backup", "export", "import", "xlsx", "reset", "cycle"], limitations: ["An Excel file is not a restorable backup."] },
  "apparence": { title: "Change language, theme, and view updates", summary: "Adapt the display without changing financial data.", prerequisites: [], steps: ["Open Settings.", "Choose Français or English under Language.", "Choose Light, Dark, or System under Appearance.", "Under About, open updates for the current version."], expectedResult: "The interface applies the preferences immediately on this device.", aliases: ["dark mode", "English", "French", "release notes", "version"], limitations: [] },
  "intelligence": { title: "Choose WiseBot or the Financial Assistant", summary: "WiseBot explains the app; the Financial Assistant analyzes your information only after consent.", prerequisites: [], steps: ["Ask WiseBot where to find a feature or how to use it.", "To understand your figures, open Financial Assistant after unlocking.", "Review the consent screen before sharing with any intelligent service."], expectedResult: "You use the correct assistant with a clear scope.", aliases: ["ai", "chat", "advice", "analysis", "prediction", "gemma"], limitations: ["WiseBot cannot see the screen or vault and does not give personalized financial advice."] },
  "securite": { title: "Understand security and privacy", summary: "Financial data stays encrypted on the device and online services remain separate.", prerequisites: [], steps: ["Lock WiseMoney after using a shared device.", "Keep the private passphrase and backups in separate places.", "Only add an image to WiseBot when you intend to send it."], expectedResult: "Data stays local until you explicitly choose to send something.", aliases: ["privacy", "encryption", "data", "consent", "image"], limitations: ["An image manually added to WiseBot is sent to the provider after consent."] },
  "hors-ligne": { title: "Use WiseMoney offline and recover from a problem", summary: "Local features and written help stay available; WiseBot waits for Internet.", prerequisites: ["Open WiseMoney online at least once."], steps: ["Install WiseMoney or open it online once so essential files are cached.", "Offline, continue local capture, budgets, and review.", "If a page remains stuck, choose Retry, then close and reopen WiseMoney.", "Do not clear browser data without a recent backup."], expectedResult: "The local app resumes when cached files and device storage are available.", aliases: ["offline", "internet", "cache", "failure", "error", "troubleshooting"], limitations: ["WiseBot and online services need a connection."] },
};

const en: ProductTask[] = fr.map((task) => ({ ...task, ...englishCopy[task.id], locale: "en" }));

export const REQUIRED_HELP_FEATURES = [
  "onboarding", "vault", "backup", "import", "passphrase", "device-unlock", "pwa-install", "accounts",
  "categories", "transactions", "transfers", "dashboard", "period-comparison", "budgets", "goals",
  "planned-expenses", "recurring", "debts", "receivables", "reminders", "calendar", "currencies",
  "export", "cycle-reset", "appearance", "language", "updates", "help-chat", "financial-assistant",
  "predictions", "recommendations", "privacy", "encryption", "consent", "offline", "troubleshooting",
] as const;

export function getHelpSections(locale: string): ProductTask[] {
  return locale.toLowerCase().startsWith("fr") ? fr : en;
}

export function getProductTask(locale: string, id: string): ProductTask | null {
  return getHelpSections(locale).find((task) => task.id === id) ?? null;
}

export function normalizeSearchText(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

const STOP_WORDS = new Set([
  "about", "avec", "avoir", "comment", "dans", "does", "faire", "from", "have", "how", "mais", "moyen",
  "pour", "peut", "plus", "quoi", "some", "that", "the", "this", "tout", "une", "vous", "what", "with",
  "est", "sont", "des", "les", "mes", "mon", "sur", "and", "can", "are", "your",
]);

function taskContent(task: ProductTask): string {
  return normalizeSearchText([task.title, task.summary, task.expectedResult, ...task.prerequisites, ...task.steps, ...task.aliases].join(" "));
}

function queryTerms(query: string): string[] {
  return normalizeSearchText(query).split(/[^a-z0-9]+/).filter((term) => term.length >= 3 && !STOP_WORDS.has(term));
}

export function searchHelpSections(tasks: ProductTask[], query: string): ProductTask[] {
  const terms = queryTerms(query);
  if (terms.length === 0) return tasks;
  return tasks.map((task) => {
    const content = taskContent(task);
    const title = normalizeSearchText(task.title);
    const aliases = normalizeSearchText(task.aliases.join(" "));
    const score = terms.reduce((total, term) => total + (title.includes(term) ? 8 : 0) + (aliases.includes(term) ? 5 : 0) + (content.includes(term) ? 2 : 0), 0);
    return { task, score, matches: terms.filter((term) => content.includes(term)).length };
  }).filter(({ matches }) => matches === terms.length)
    .sort((left, right) => right.score - left.score || left.task.title.localeCompare(right.task.title))
    .map(({ task }) => task);
}

export function findRelevantHelpSections(
  tasks: ProductTask[], question: string, limit = 4, fallbackIds: string[] = [], surfaceId?: SurfaceId,
): ProductTask[] {
  const terms = queryTerms(question);
  const fallbackRanks = new Map(fallbackIds.slice(-3).map((id, index) => [id, fallbackIds.length - index]));
  const ranked = tasks.map((task, index) => {
    const content = taskContent(task);
    const title = normalizeSearchText(task.title);
    const aliases = normalizeSearchText(task.aliases.join(" "));
    const termScore = terms.reduce((score, term) => score + (title.includes(term) ? 10 : 0) + (aliases.includes(term) ? 7 : 0) + (content.includes(term) ? 2 : 0), 0);
    return { task, index, score: termScore + (fallbackRanks.get(task.id) ?? 0) * 5 + (surfaceId != null && task.surfaces.includes(surfaceId) ? 4 : 0) };
  }).filter(({ score }) => score > 0 || terms.length === 0)
    .sort((left, right) => right.score - left.score || left.index - right.index);
  if (ranked.length === 0) {
    return fallbackIds.flatMap((id) => tasks.find((task) => task.id === id) ?? []).slice(-limit);
  }
  return ranked.slice(0, limit).map(({ task }) => task);
}

export function localTaskAnswer(task: ProductTask): string {
  const resultLabel = task.locale === "fr" ? "Résultat" : "Result";
  const limitationLabel = task.locale === "fr" ? "À savoir" : "Good to know";
  return [task.summary, "", ...task.steps.map((step, index) => `${index + 1}. ${step}`), "", `**${resultLabel} :** ${task.expectedResult}`,
    ...(task.limitations.length === 0 ? [] : ["", `**${limitationLabel} :** ${task.limitations[0]}`])].join("\n");
}
