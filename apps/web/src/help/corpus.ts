export type HelpLocale = "en" | "fr";

export type HelpSection = {
  id: string;
  title: string;
  summary: string;
  steps: string[];
  keywords: string[];
  features: string[];
};

const fr: HelpSection[] = [
  {
    id: "demarrage",
    title: "Démarrer avec WiseMoney",
    summary: "Créez votre espace privé, puis commencez par un compte et un premier mouvement.",
    steps: [
      "Choisissez Commencer et lisez les quatre étapes de présentation.",
      "Créez une phrase privée que vous pourrez conserver hors de votre téléphone.",
      "Ajoutez votre compte principal, puis enregistrez un revenu ou une dépense.",
    ],
    keywords: ["commencer", "premier", "nouveau", "espace"],
    features: ["onboarding", "vault"],
  },
  {
    id: "phrase-privee",
    title: "Phrase privée et déverrouillage",
    summary: "Votre phrase privée chiffre les données de cet appareil et ne peut pas être récupérée par WiseMoney.",
    steps: [
      "Utilisez une phrase longue, unique et mémorisable; ne la partagez jamais.",
      "Activez le visage, l’empreinte, le code PIN ou une clé de sécurité si votre appareil le permet.",
      "Gardez la phrase privée comme solution de récupération, même après avoir activé le déverrouillage de l’appareil.",
    ],
    keywords: ["mot de passe", "passphrase", "empreinte", "visage", "pin", "webauthn"],
    features: ["passphrase", "device-unlock"],
  },
  {
    id: "installation",
    title: "Installer l’application",
    summary: "Ajoutez WiseMoney à l’écran d’accueil pour l’ouvrir en plein écran et mieux l’utiliser hors ligne.",
    steps: [
      "Android : ouvrez le menu de Chrome, puis choisissez Installer l’application ou Ajouter à l’écran d’accueil.",
      "iPhone ou iPad : dans Safari, touchez Partager, puis Sur l’écran d’accueil.",
      "Ordinateur : utilisez l’icône d’installation dans la barre d’adresse ou le menu de Chrome, Edge ou Safari.",
    ],
    keywords: ["pwa", "android", "iphone", "ios", "ordinateur", "bureau", "écran accueil"],
    features: ["pwa-install"],
  },
  {
    id: "comptes",
    title: "Comptes et soldes",
    summary: "Suivez séparément espèces, mobile money, banque et carte, sans mélanger leurs soldes.",
    steps: [
      "Ouvrez Saisie, puis Gérer pour créer un compte avec sa devise et son solde initial.",
      "Archivez un compte que vous n’utilisez plus; son historique reste conservé.",
      "Le solde total réunit les montants disponibles de tous les comptes actifs dans la devise principale.",
    ],
    keywords: ["espèces", "mobile money", "banque", "carte", "solde", "devise"],
    features: ["accounts", "currencies"],
  },
  {
    id: "transactions",
    title: "Transactions et virements",
    summary: "Enregistrez revenus, dépenses et virements; modifiez ou supprimez une saisie depuis l’historique.",
    steps: [
      "Dans Saisie, choisissez le type de mouvement, le compte, la catégorie, le montant et la date.",
      "Un revenu augmente un compte; une dépense le diminue; un virement déplace l’argent entre deux comptes.",
      "Depuis l’historique du tableau de bord, ouvrez une transaction pour la corriger ou la supprimer.",
    ],
    keywords: ["revenu", "dépense", "virement", "catégorie", "modifier", "supprimer"],
    features: ["transactions", "transfers", "categories"],
  },
  {
    id: "tableau-de-bord",
    title: "Lire le tableau de bord",
    summary: "Comparez le solde disponible, les revenus, les dépenses et la différence de la période.",
    steps: [
      "Le solde total est l’argent disponible maintenant; il ne dépend pas seulement du mois affiché.",
      "La différence de la période correspond aux revenus moins les dépenses sur les dates choisies.",
      "Si la période précédente était à zéro, WiseMoney indique un nouveau montant plutôt qu’un pourcentage trompeur.",
    ],
    keywords: ["dashboard", "chiffres", "solde total", "revenus", "dépenses", "comparaison"],
    features: ["dashboard", "period-comparison"],
  },
  {
    id: "planification",
    title: "Budgets, objectifs et planification",
    summary: "Fixez des limites, suivez une épargne et préparez les dépenses ponctuelles ou les paiements qui reviennent.",
    steps: [
      "Créez un budget par catégorie : le pourcentage utilisé compare les dépenses à votre limite.",
      "Créez un objectif avec un montant cible, puis ajoutez des contributions depuis Saisie.",
      "Une dépense prévue prépare un achat ponctuel et ne touche aucun solde tant que vous ne la marquez pas comme faite; elle crée alors une transaction réelle.",
      "Un élément récurrent sert aux revenus ou paiements qui reviennent; réalisez chaque occurrence lorsqu’elle arrive à échéance.",
    ],
    keywords: ["budget", "objectif", "épargne", "dépense prévue", "ponctuelle", "récurrent", "transaction", "abonnement", "limite"],
    features: ["budgets", "goals", "planned-expenses", "recurring"],
  },
  {
    id: "dettes",
    title: "Dettes et créances",
    summary: "Notez ce que vous devez et ce que l’on vous doit, avec échéance, motif et statut.",
    steps: [
      "Dans Planification, ouvrez Dettes et créances, puis indiquez la personne, le montant et l’échéance.",
      "Une créance est une somme que vous devez recevoir; une dette est une somme que vous devez payer.",
      "Marquez l’élément comme réglé lorsque le paiement est terminé.",
    ],
    keywords: ["dette", "créance", "prêt", "remboursement", "échéance"],
    features: ["debts", "receivables"],
  },
  {
    id: "sauvegarde",
    title: "Sauvegarder, importer, exporter et recommencer",
    summary: "Créez une sauvegarde restaurable avant de changer d’appareil ou de clôturer un cycle.",
    steps: [
      "Dans Paramètres, exportez une sauvegarde chiffrée et conservez sa phrase séparément du fichier.",
      "Pour restaurer, choisissez le fichier exporté puis créez une phrase privée sur le nouvel appareil.",
      "Avant une remise à zéro, WiseMoney produit une sauvegarde restaurable et un relevé lisible; vérifiez les deux fichiers.",
    ],
    keywords: ["backup", "import", "export", "xlsx", "csv", "reset", "réinitialiser", "cycle"],
    features: ["backup", "import", "export", "cycle-reset"],
  },
  {
    id: "intelligence",
    title: "Aide Gemma et Assistant financier",
    summary: "Le chat de cette page explique WiseMoney; l’Assistant financier analyse vos données seulement avec votre accord.",
    steps: [
      "Demandez au chat d’aide où trouver une fonction ou comment l’utiliser; il ne reçoit aucune donnée financière du coffre.",
      "Pour une prédiction, une recommandation ou une explication de vos chiffres, ouvrez l’Assistant financier après déverrouillage.",
      "Les fonctions financières intelligentes peuvent être temporairement grisées; les comptes, saisies et calculs locaux continuent de fonctionner.",
    ],
    keywords: ["ia", "gemma", "chat", "assistant", "prédiction", "recommandation", "conseil"],
    features: ["help-chat", "financial-assistant", "predictions", "recommendations"],
  },
  {
    id: "securite",
    title: "Sécurité et confidentialité",
    summary: "Les données financières restent chiffrées sur l’appareil; les services intelligents sont séparés et consentis.",
    steps: [
      "Verrouillez WiseMoney lorsque vous avez terminé sur un appareil partagé.",
      "Le chat d’aide n’accède ni au coffre ni à l’écran et n’enregistre pas la conversation sur le serveur.",
      "Une image n’est envoyée qu’après votre ajout manuel et votre admission dans la file; vous pouvez la retirer avant l’envoi.",
    ],
    keywords: ["confidentialité", "chiffrement", "données", "image", "consentement", "verrouiller"],
    features: ["privacy", "encryption", "consent"],
  },
  {
    id: "hors-ligne",
    title: "Hors ligne et dépannage",
    summary: "L’aide écrite et les fonctions locales restent disponibles; le chat et les services en ligne attendent la connexion.",
    steps: [
      "Installez WiseMoney et ouvrez-le une première fois en ligne pour mettre les fichiers essentiels en cache.",
      "Sans réseau, continuez les saisies, comptes, budgets et consultations; le chat se réactive automatiquement au retour d’Internet.",
      "Si une page ne se met pas à jour, fermez puis rouvrez l’application. N’effacez pas les données du navigateur sans sauvegarde récente.",
    ],
    keywords: ["offline", "internet", "connexion", "cache", "panne", "erreur", "dépannage"],
    features: ["offline", "troubleshooting"],
  },
];

const en: HelpSection[] = [
  {
    id: "demarrage", title: "Get started with WiseMoney", summary: "Create your private space, then begin with one account and your first money movement.",
    steps: ["Choose Start and review the four introduction steps.", "Create a private passphrase you can keep outside your phone.", "Add your main account, then record income or an expense."],
    keywords: ["start", "first", "new", "workspace"], features: ["onboarding", "vault"],
  },
  {
    id: "phrase-privee", title: "Private passphrase and unlock", summary: "Your private passphrase encrypts this device’s data and cannot be recovered by WiseMoney.",
    steps: ["Use a long, unique, memorable phrase and never share it.", "Enable face, fingerprint, PIN, or a security key if your device supports it.", "Keep the private passphrase as your recovery method after enabling device unlock."],
    keywords: ["password", "passphrase", "fingerprint", "face", "pin", "webauthn"], features: ["passphrase", "device-unlock"],
  },
  {
    id: "installation", title: "Install the app", summary: "Add WiseMoney to your home screen for full-screen access and more reliable offline use.",
    steps: ["Android: open Chrome’s menu, then choose Install app or Add to Home screen.", "iPhone or iPad: in Safari, tap Share, then Add to Home Screen.", "Computer: use the install icon in the address bar or the Chrome, Edge, or Safari menu."],
    keywords: ["pwa", "android", "iphone", "ios", "desktop", "computer", "home screen"], features: ["pwa-install"],
  },
  {
    id: "comptes", title: "Accounts and balances", summary: "Track cash, mobile money, bank, and card accounts separately without mixing their balances.",
    steps: ["Open Capture, then Manage to create an account with its currency and opening balance.", "Archive an account you no longer use; its history stays available.", "Total balance combines available money from active accounts in your base currency."],
    keywords: ["cash", "mobile money", "bank", "card", "balance", "currency"], features: ["accounts", "currencies"],
  },
  {
    id: "transactions", title: "Transactions and transfers", summary: "Record income, expenses, and transfers; edit or delete an entry from history.",
    steps: ["In Capture, choose the movement type, account, category, amount, and date.", "Income increases an account; an expense decreases it; a transfer moves money between two accounts.", "From Dashboard history, open a transaction to correct or delete it."],
    keywords: ["income", "expense", "transfer", "category", "edit", "delete"], features: ["transactions", "transfers", "categories"],
  },
  {
    id: "tableau-de-bord", title: "Read the dashboard", summary: "Compare available balance, income, expenses, and the difference for the selected period.",
    steps: ["Total balance is money available now; it is not limited to the displayed month.", "Period difference is income minus expenses across the selected dates.", "When the previous period was zero, WiseMoney shows a new amount instead of a misleading percentage."],
    keywords: ["dashboard", "figures", "total balance", "income", "expenses", "comparison"], features: ["dashboard", "period-comparison"],
  },
  {
    id: "planification", title: "Budgets, goals, and planning", summary: "Set limits, track savings, and prepare one-off expenses or payments that come back regularly.",
    steps: ["Create a category budget: percentage used compares spending with your limit.", "Create a goal with a target amount, then add contributions from Capture.", "A planned expense prepares a one-off purchase and affects no balance until you mark it completed; that action creates an actual transaction.", "A recurring item represents income or payments that repeat; realize each occurrence when it becomes due."],
    keywords: ["budget", "goal", "saving", "planned expense", "one-off", "recurring", "transaction", "subscription", "limit"], features: ["budgets", "goals", "planned-expenses", "recurring"],
  },
  {
    id: "dettes", title: "Debts and receivables", summary: "Record what you owe and what others owe you, with a due date, purpose, and status.",
    steps: ["In Planning, open Debts & receivables, then enter the person, amount, and due date.", "A receivable is money you expect to receive; a debt is money you need to pay.", "Mark the item settled when the payment is complete."],
    keywords: ["debt", "receivable", "loan", "repayment", "due date"], features: ["debts", "receivables"],
  },
  {
    id: "sauvegarde", title: "Back up, import, export, and reset", summary: "Create a restorable backup before moving devices or closing a financial cycle.",
    steps: ["In Settings, export an encrypted backup and keep its passphrase separately from the file.", "To restore, choose the export file and create a private passphrase on the new device.", "Before reset, WiseMoney creates a restorable backup and a readable statement; verify both files."],
    keywords: ["backup", "import", "export", "xlsx", "csv", "reset", "cycle"], features: ["backup", "import", "export", "cycle-reset"],
  },
  {
    id: "intelligence", title: "Gemma help and the Financial Assistant", summary: "This page’s chat explains WiseMoney; the Financial Assistant analyzes your data only with your consent.",
    steps: ["Ask help chat where to find a feature or how to use it; it receives no financial records from the vault.", "For predictions, recommendations, or explanations of your figures, open Financial Assistant after unlocking.", "Financial smart features may be temporarily disabled; accounts, capture, and local calculations keep working."],
    keywords: ["ai", "gemma", "chat", "assistant", "prediction", "recommendation", "advice"], features: ["help-chat", "financial-assistant", "predictions", "recommendations"],
  },
  {
    id: "securite", title: "Security and privacy", summary: "Financial records stay encrypted on the device; smart services are separate and consent-based.",
    steps: ["Lock WiseMoney when you finish on a shared device.", "Help chat cannot access the vault or screen and does not store the conversation on the server.", "An image is sent only after you add it manually and are admitted to the queue; you can remove it before sending."],
    keywords: ["privacy", "encryption", "data", "image", "consent", "lock"], features: ["privacy", "encryption", "consent"],
  },
  {
    id: "hors-ligne", title: "Offline use and troubleshooting", summary: "Written help and local features remain available; chat and online services wait for a connection.",
    steps: ["Install WiseMoney and open it online once so essential files can be cached.", "Offline, keep using capture, accounts, budgets, and reports; chat returns automatically with Internet.", "If a page does not refresh, close and reopen the app. Do not clear browser data without a recent backup."],
    keywords: ["offline", "internet", "connection", "cache", "failure", "error", "troubleshooting"], features: ["offline", "troubleshooting"],
  },
];

export const REQUIRED_HELP_FEATURES = [
  "onboarding", "vault", "passphrase", "device-unlock", "pwa-install", "accounts", "currencies",
  "transactions", "transfers", "categories", "dashboard", "period-comparison", "budgets", "goals",
  "planned-expenses", "recurring", "debts", "receivables", "backup", "import", "export", "cycle-reset", "help-chat",
  "financial-assistant", "predictions", "recommendations", "privacy", "encryption", "consent", "offline",
  "troubleshooting",
] as const;

export function getHelpSections(locale: string): HelpSection[] {
  return locale.toLowerCase().startsWith("fr") ? fr : en;
}

export function normalizeSearchText(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

export function searchHelpSections(sections: HelpSection[], query: string): HelpSection[] {
  const terms = normalizeSearchText(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return sections;

  return sections
    .map((section) => {
      const title = normalizeSearchText(section.title);
      const content = normalizeSearchText([section.title, section.summary, ...section.steps, ...section.keywords].join(" "));
      const matches = terms.filter((term) => content.includes(term));
      const score = matches.length * 2 + terms.filter((term) => title.includes(term)).length * 3;
      return { section, score };
    })
    .filter(({ section }) => {
      const content = normalizeSearchText([section.title, section.summary, ...section.steps, ...section.keywords].join(" "));
      return terms.every((term) => content.includes(term));
    })
    .sort((a, b) => b.score - a.score)
    .map(({ section }) => section);
}

export function findRelevantHelpSections(sections: HelpSection[], question: string, limit = 3): HelpSection[] {
  const matches = searchHelpSections(sections, question);
  return (matches.length > 0 ? matches : sections).slice(0, limit);
}
