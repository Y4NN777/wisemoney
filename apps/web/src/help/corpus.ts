import { HELP_KNOWLEDGE_VERSION, HELP_SURFACES, type HelpLocale, type SurfaceId } from "./surfaces.js";

export { HELP_KNOWLEDGE_VERSION, HELP_SURFACES, type HelpLocale, type SurfaceId };

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
    steps: ["Depuis la page d’accueil, choisissez Commencer.", "Créez votre phrase privée (trois mots au hasard conviennent ; l’icône en forme d’œil affiche ce que vous tapez), confirmez-la puis choisissez Créer l’espace privé.", "Vérifiez la devise et le compte, puis enregistrez un premier mouvement.", "Posez un premier plan ou choisissez Plus tard.", "Pour installer WiseMoney, utilisez le bouton d’installation en haut de la page d’accueil, ou plus tard Paramètres, À propos de WiseMoney, Installer WiseMoney ; sinon continuez dans le navigateur."],
    expectedResult: "WiseMoney ouvre votre tableau de bord privé sur cet appareil.",
    aliases: ["commencer", "première utilisation", "créer espace", "onboarding"], surfaces: ["landing", "onboarding"],
    limitations: ["WiseMoney ne peut pas récupérer une phrase privée oubliée."], features: ["onboarding", "vault"],
  },
  {
    id: "restauration", groupId: "acces", locale: "fr", title: "Restaurer un espace existant", route: null,
    summary: "Rouvrez vos données sur cet appareil à partir d’une sauvegarde chiffrée créée par WiseMoney.",
    prerequisites: ["Disposer du fichier d’export WiseMoney, et de sa phrase s’il a été protégé."],
    steps: ["Sur la page d’accueil de WiseMoney, choisissez « J’ai une sauvegarde : la restaurer ». Dans l’application installée, sans espace existant, l’écran de restauration s’affiche directement.", "Dans Fichier d’export, sélectionnez le fichier exporté depuis votre autre appareil.", "Saisissez la Nouvelle phrase secrète pour cet appareil, puis confirmez-la.", "Si l’export était protégé, saisissez sa phrase dans Phrase secrète d’export, si utilisée ; sinon laissez ce champ vide.", "Choisissez Restaurer l’espace.", "Si un espace existe déjà sur l’appareil : ouvrez Paramètres, Données et sauvegarde, et sélectionnez le fichier dans Importer ; cela remplace toutes les données existantes."],
    expectedResult: "Les données de la sauvegarde sont importées et le nouvel espace s’ouvre.",
    aliases: ["importer compte", "fichier export", "récupérer données", "changer téléphone"], surfaces: ["restore", "landing"],
    limitations: ["Un relevé Excel ou un calendrier ne peut pas restaurer l’espace."], features: ["backup", "import"],
  },
  {
    id: "phrase-privee", groupId: "acces", locale: "fr", title: "Ouvrir avec la phrase privée ou l’appareil", route: null,
    summary: "La phrase privée reste la clé de secours ; le visage, l’empreinte ou le code de l’appareil peuvent accélérer l’ouverture.",
    prerequisites: ["Avoir déjà créé un espace WiseMoney."],
    steps: ["Choisissez Ouvrir mon espace.", "Si le déverrouillage de l’appareil est activé, choisissez Ouvrir et confirmez avec le verrouillage d’écran de l’appareil.", "Sinon, choisissez Utiliser ma phrase privée, saisissez-la puis choisissez Ouvrir. L’icône en forme d’œil affiche ce que vous tapez.", "Pour l’activer : ouvrez Paramètres, Sécurité et session, choisissez Activer le déverrouillage de l’appareil, saisissez votre phrase privée puis choisissez Activer."],
    expectedResult: "Le coffre est déverrouillé localement.",
    aliases: ["mot de passe", "empreinte", "visage", "pin", "webauthn", "déverrouiller"], surfaces: ["landing", "unlock"],
    limitations: ["Les options biométriques dépendent du navigateur et de l’appareil."], features: ["passphrase", "device-unlock"],
  },
  {
    id: "installation", groupId: "acces", locale: "fr", title: "Installer WiseMoney sur cet appareil", route: null,
    summary: "Ajoutez WiseMoney à l’écran d’accueil pour l’ouvrir comme vos autres applications.",
    prerequisites: ["Ouvrir WiseMoney dans un navigateur compatible."],
    steps: ["Dans WiseMoney : ouvrez Paramètres ; dans À propos de WiseMoney, choisissez Installer WiseMoney.", "Android : ouvrez le menu de Chrome puis choisissez Installer l’application ou Ajouter à l’écran d’accueil.", "iPhone ou iPad : dans Safari, touchez Partager puis Sur l’écran d’accueil.", "Ordinateur : utilisez l’icône d’installation dans la barre d’adresse ou le menu du navigateur."],
    expectedResult: "L’icône WiseMoney apparaît parmi les applications de l’appareil.",
    aliases: ["pwa", "android", "iphone", "ios", "écran accueil", "application"], surfaces: ["landing", "onboarding", "help"],
    limitations: ["Le bouton exact dépend du navigateur ; l’installation n’utilise pas une boutique."], features: ["pwa-install"],
  },
  {
    id: "comptes", groupId: "suivi", locale: "fr", title: "Créer et gérer un compte", route: "/settings?panel=accounts",
    summary: "Séparez espèces, mobile money, banque et carte pour conserver des soldes lisibles.",
    prerequisites: ["Avoir ouvert l’espace privé."],
    steps: ["Ouvrez Paramètres (icône d’engrenage en haut de l’écran).", "Ouvrez Comptes et catégories, puis l’onglet Comptes.", "Choisissez Nouveau, renseignez le nom du compte, son type, sa devise et son solde initial, puis choisissez Créer le compte.", "Utilisez l’icône crayon pour modifier le nom ou le type, ou la corbeille pour archiver le compte."],
    expectedResult: "Le compte actif devient disponible dans les saisies et le tableau de bord.",
    aliases: ["espèces", "mobile money", "banque", "carte", "solde initial"], surfaces: ["settings", "dashboard"],
    limitations: ["Archiver conserve l’historique ; cela ne supprime pas les anciennes opérations."], features: ["accounts"],
  },
  {
    id: "categories", groupId: "suivi", locale: "fr", title: "Créer et organiser les catégories", route: "/settings?panel=categories",
    summary: "Utilisez des catégories pour comprendre où va l’argent et suivre les budgets.",
    prerequisites: ["Avoir ouvert l’espace privé."],
    steps: ["Ouvrez Paramètres, puis Comptes et catégories.", "Choisissez l’onglet Catégories, puis Nouveau.", "Saisissez le nom de la catégorie, puis choisissez Créer la catégorie.", "Depuis sa ligne, utilisez le crayon pour renommer une catégorie ou la corbeille pour l’archiver."],
    expectedResult: "La catégorie est proposée pour les transactions, budgets et éléments planifiés.",
    aliases: ["classement", "type dépense", "renommer catégorie"], surfaces: ["settings", "budgets"],
    limitations: ["Une catégorie utilisée par un élément actif peut devoir rester disponible."], features: ["categories"],
  },
  {
    id: "transactions", groupId: "suivi", locale: "fr", title: "Enregistrer, corriger ou supprimer une transaction", route: "/?capture=transaction",
    summary: "Ajoutez un revenu ou une dépense puis retrouvez-le dans Activité.",
    prerequisites: ["Avoir ouvert l’espace privé."],
    steps: ["Touchez le bouton + (Saisie) ; l’onglet Dépense / Revenu s’ouvre.", "Choisissez Dépense ou Revenu, saisissez le montant, puis choisissez la catégorie ; le compte n’est demandé que si vous en avez plusieurs, et la date est celle du jour par défaut.", "Choisissez Ajouter.", "Pour corriger ou supprimer l’opération, ouvrez Activité, touchez sa ligne, puis choisissez Modifier la transaction ou Supprimer la transaction ; sur l’Accueil, le crayon et la corbeille des Mouvements récents font la même chose."],
    expectedResult: "Le solde du compte et les indicateurs de la période sont recalculés.",
    aliases: ["revenu", "dépense", "mouvement", "modifier opération", "historique"], surfaces: ["dashboard", "operations"],
    limitations: ["La suppression d’une transaction est définitive dans le cycle courant.", "Seuls les revenus et les dépenses peuvent être modifiés ou supprimés ; le compte et la date d’origine ne changent pas."], features: ["transactions"],
  },
  {
    id: "virements", groupId: "suivi", locale: "fr", title: "Transférer entre deux comptes et suivre le transfert", route: "/?capture=transfer",
    summary: "Déplacez de l’argent entre deux de vos comptes, même s’ils utilisent des devises différentes.",
    prerequisites: ["Avoir deux comptes actifs ; ajouter un taux de change local si leurs devises diffèrent."],
    steps: ["Touchez le bouton + (Saisie), puis l’onglet Transfert.", "Choisissez le Compte source ; sous « Où va l’argent ? », choisissez Un de mes comptes, puis le Compte destinataire.", "Saisissez le montant et la note éventuelle ; si les devises diffèrent, vérifiez le montant que le compte destinataire recevra.", "Choisissez Déplacer entre mes comptes, puis ouvrez Activité pour retrouver le mouvement."],
    expectedResult: "Le compte source est débité, le compte destinataire est crédité et le mouvement reste neutre dans l’activité globale.",
    aliases: ["transfert", "compte à compte", "changer de compte", "conversion", "suivre transfert"], surfaces: ["dashboard", "operations"],
    limitations: ["Sans taux disponible, WiseMoney ne peut pas enregistrer un mouvement entre deux devises différentes ; un transfert ne se modifie pas après enregistrement."], features: ["transfers"],
  },
  {
    id: "tableau-de-bord", groupId: "suivi", locale: "fr", title: "Lire le tableau de bord et l’activité", route: "/",
    summary: "Comparez le solde disponible, les revenus, les dépenses et la différence de la période choisie.",
    prerequisites: ["Avoir ouvert l’espace privé."],
    steps: ["Choisissez la période à analyser en haut du tableau de bord.", "Lisez « Argent disponible aujourd’hui » : c’est le solde de vos comptes actifs.", "Comparez Argent reçu, Argent dépensé et Différence pour le mois.", "Ouvrez Activité pour rechercher, filtrer ou exporter les mouvements du mois.", "Ouvrez Plus sur ce mois pour voir les graphiques, les budgets et les objectifs."],
    expectedResult: "Les indicateurs et graphiques correspondent au mois sélectionné ; pour un mois passé, le solde affiché est celui de la fin de ce mois.",
    aliases: ["dashboard", "activité", "graphiques", "solde total", "toutes opérations"], surfaces: ["dashboard", "operations"],
    limitations: ["Les comptes sans taux de change peuvent être exclus du total dans la devise principale."], features: ["dashboard", "period-comparison"],
  },
  {
    id: "budgets", groupId: "planification", locale: "fr", title: "Créer et suivre un budget", route: "/budgets",
    summary: "Fixez une limite par catégorie et suivez la part déjà consommée.",
    prerequisites: ["Avoir une catégorie active."],
    steps: ["Ouvrez Plan, puis Budgets.", "Choisissez Ajouter un budget.", "Renseignez le nom, la catégorie, la limite mensuelle et la période, puis choisissez Créer un budget.", "Consultez la progression ; utilisez l’icône d’archive du budget lorsqu’il n’est plus utile."],
    expectedResult: "Les dépenses de la catégorie alimentent automatiquement le pourcentage utilisé.",
    aliases: ["limite", "plafond", "pourcentage dépensé"], surfaces: ["planning", "budgets"],
    limitations: ["Créer un budget ne bloque pas une dépense."], features: ["budgets"],
  },
  {
    id: "objectifs", groupId: "planification", locale: "fr", title: "Créer un objectif et ajouter une contribution", route: "/goals",
    summary: "Définissez une cible d’épargne puis suivez chaque contribution.",
    prerequisites: ["Avoir ouvert l’espace privé."],
    steps: ["Ouvrez Plan, puis Objectifs.", "Choisissez Ajouter un objectif, indiquez son nom et son montant cible, puis choisissez Créer un objectif d’épargne.", "Pour contribuer, touchez le bouton + (Saisie), puis l’onglet Objectif ; choisissez l’objectif, saisissez le montant, puis choisissez Ajouter la contribution."],
    expectedResult: "La progression de l’objectif augmente du montant contribué.",
    aliases: ["épargne", "cagnotte", "contribution", "montant cible"], surfaces: ["planning", "goals", "dashboard"],
    limitations: ["Une contribution suit la progression ; elle n’effectue pas un transfert bancaire réel."], features: ["goals"],
  },
  {
    id: "depenses-prevues", groupId: "planification", locale: "fr", title: "Préparer puis réaliser une dépense prévue", route: "/planned-expenses",
    summary: "Planifiez un achat ponctuel sans modifier les soldes avant sa réalisation.",
    prerequisites: ["Avoir un compte et une catégorie actifs pour réaliser la dépense."],
    steps: ["Ouvrez Plan, puis Dépenses prévues.", "Choisissez Ajouter une dépense prévue, puis renseignez le libellé, le montant estimé, la devise, la catégorie, la priorité et l’échéance facultative.", "Tant qu’elle est en attente, utilisez Modifier ou Annuler.", "Quand elle a lieu, choisissez Marquer comme faite, indiquez le montant réel, le compte et la date effective, puis choisissez Confirmer le paiement."],
    expectedResult: "La dépense prévue est terminée et une transaction réelle apparaît dans l’activité.",
    aliases: ["achat futur", "ponctuel", "prévision", "réaliser dépense"], surfaces: ["planning", "planned-expenses"],
    limitations: ["Une dépense en attente ne change aucun solde."], features: ["planned-expenses"],
  },
  {
    id: "recurrent", groupId: "planification", locale: "fr", title: "Suivre un revenu ou paiement récurrent", route: "/recurring",
    summary: "Préparez une opération qui revient et réalisez chaque occurrence à son échéance.",
    prerequisites: ["Avoir une catégorie active ; un compte actif est nécessaire pour réaliser une occurrence."],
    steps: ["Ouvrez Plan, puis Transactions récurrentes.", "Choisissez Ajouter un récurrent, puis renseignez le libellé, la catégorie, le montant, le sens, la fréquence et la date de début.", "À l’échéance, choisissez Réaliser, sélectionnez le compte, puis choisissez Enregistrer l’occurrence.", "Utilisez l’icône d’archive lorsque l’élément ne revient plus."],
    expectedResult: "La transaction est enregistrée et la date de la dernière occurrence s’affiche sur l’élément.",
    aliases: ["abonnement", "salaire", "paiement mensuel", "occurrence"], surfaces: ["planning", "recurring"],
    limitations: ["WiseMoney n’exécute aucun paiement bancaire automatiquement."], features: ["recurring"],
  },
  {
    id: "dettes", groupId: "planification", locale: "fr", title: "Suivre une dette ou une créance", route: "/debts",
    summary: "Notez ce que vous devez ou ce que l’on vous doit, avec une échéance facultative.",
    prerequisites: ["Avoir ouvert l’espace privé."],
    steps: ["Ouvrez Plan, puis Dettes & Créances.", "Choisissez Ajouter, sélectionnez le type (Créance ou Dette), puis renseignez le nom, le motif, le montant et l’échéance facultative.", "Modifiez l’échéance depuis la fiche puis choisissez Enregistrer ; Ajouter au calendrier apparaît lorsqu’une échéance est définie.", "Quand le paiement est terminé, passez le statut de l’élément à Soldé."],
    expectedResult: "L’élément conserve son statut et son échéance jusqu’à son règlement.",
    aliases: ["prêt", "recevoir", "rembourser", "créance", "échéance"], surfaces: ["planning", "debts"],
    limitations: ["Passer un élément à Soldé ne crée pas automatiquement une transaction."], features: ["debts", "receivables"],
  },
  {
    id: "rappels", groupId: "organisation", locale: "fr", title: "Configurer les rappels et le calendrier", route: "/settings",
    summary: "Choisissez les échéances à rappeler sur cet appareil ou exportez-les vers votre calendrier.",
    prerequisites: ["Installer WiseMoney pour améliorer la fiabilité des notifications."],
    steps: ["Ouvrez Paramètres, puis Rappels et calendrier.", "Activez « Activer les rappels WiseMoney », puis les types utiles.", "Choisissez Autoriser les notifications système si vous les souhaitez.", "Utilisez Ajouter au calendrier sur une échéance, ou Ajouter la revue au calendrier pour la revue hebdomadaire."],
    expectedResult: "Les rappels locaux sont préparés selon vos choix, sans montant dans leur texte.",
    aliases: ["notification", "son", "calendrier", "échéance", "revue hebdomadaire"], surfaces: ["settings", "planned-expenses", "recurring", "debts"],
    limitations: ["Le navigateur décide du moment exact des notifications en arrière-plan."], features: ["reminders", "calendar"],
  },
  {
    id: "devises", groupId: "reglages", locale: "fr", title: "Choisir la devise principale et les taux", route: "/settings",
    summary: "Convertissez les comptes de plusieurs devises avec des taux que vous contrôlez.",
    prerequisites: ["Avoir ouvert l’espace privé."],
    steps: ["Ouvrez Paramètres, puis Argent et devise.", "Choisissez la Devise par défaut.", "Sous Ajouter un taux, indiquez De, Vers et Taux, puis validez avec le bouton +.", "Revenez au tableau de bord pour inclure les comptes convertibles dans le total."],
    expectedResult: "WiseMoney calcule les totaux avec les taux enregistrés localement.",
    aliases: ["monnaie", "fx", "taux change", "conversion"], surfaces: ["settings", "dashboard"],
    limitations: ["WiseMoney ne télécharge pas automatiquement les taux du marché."], features: ["currencies"],
  },
  {
    id: "sauvegarde", groupId: "reglages", locale: "fr", title: "Sauvegarder, exporter et recommencer", route: "/settings",
    summary: "Créez un fichier restaurable avant de changer d’appareil ou de clôturer un cycle.",
    prerequisites: ["Avoir ouvert l’espace privé."],
    steps: ["Ouvrez Paramètres, puis Données et sauvegarde.", "Pour une restauration future, choisissez Exportation chiffrée, saisissez une phrase de passe puis Chiffrer et télécharger ; conservez cette phrase séparément.", "Utilisez Exporter CSV ou Exporter XLSX pour consulter les données, pas pour restaurer.", "Pour clôturer un cycle, choisissez Archiver et recommencer, téléchargez la sauvegarde et le relevé XLSX, puis vérifiez-les avant de confirmer."],
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
    id: "intelligence", groupId: "aide", locale: "fr", title: "Choisir entre WiseHelp, l’Assistant et WiseLearn", route: "/help",
    summary: "WiseHelp explique l’application ; l’Assistant analyse vos informations seulement après votre accord ; WiseLearn répond aux questions sur l’argent en général.", prerequisites: [],
    steps: ["Ouvrez WiseHelp avec le bouton d’aide en haut de l’écran et demandez où trouver une fonction ou comment l’utiliser.", "Pour comprendre vos propres chiffres, ouvrez l’Assistant : Paramètres, Services d’assistant optionnels, Ouvrir l’assistant (ou la carte Assistant de l’Accueil une fois un service configuré).", "Vérifiez l’écran de consentement avant tout partage avec un service intelligent.", "Pour une question sur l’argent en général, ouvrez WiseLearn : ses réponses n’utilisent pas vos chiffres."],
    expectedResult: "Vous utilisez le bon assistant avec un périmètre clair.",
    aliases: ["ia", "chat", "conseil", "analyse", "prédiction", "gemma", "wisebot", "wisehelp", "wiselearn"], surfaces: ["help", "assistant", "global"],
    limitations: ["WiseHelp ne voit ni l’écran ni le coffre et ne fournit pas de conseil financier personnalisé."], features: ["help-chat", "financial-assistant", "predictions", "recommendations"],
  },
  {
    id: "apprendre", groupId: "aide", locale: "fr", title: "Poser une question d’éducation financière", route: "/learn",
    summary: "Posez une question sur l’argent ; la réponse s’appuie sur les leçons de WiseMoney et cite sa source.",
    prerequisites: ["Avoir ouvert l’espace privé et une connexion Internet."],
    steps: ["Depuis l’Accueil, ouvrez la carte WiseLearn.", "Choisissez une des questions proposées, ou saisissez la vôtre puis choisissez Demander au tuteur.", "La première fois, une mention s’affiche : « Les réponses du tuteur passent par Google. Rien de votre coffre. » Choisissez OK pour l’accepter.", "Sous la réponse, une ligne Source indique la leçon et l’organisme dont elle vient."],
    expectedResult: "Vous lisez une réponse courte, avec sa source.",
    aliases: ["éducation financière", "leçons", "cours", "tuteur", "apprendre", "épargne", "investir", "question d’argent"], surfaces: ["dashboard", "assistant", "global"],
    limitations: ["De l’éducation, pas du conseil.", "Il faut une connexion : les leçons ne sont pas sur le téléphone."], features: ["literacy"],
  },
  {
    id: "securite", groupId: "aide", locale: "fr", title: "Comprendre la sécurité et la confidentialité", route: "/help",
    summary: "Les données financières restent chiffrées sur l’appareil et les services en ligne sont séparés.", prerequisites: [],
    steps: ["Verrouillez WiseMoney après utilisation sur un appareil partagé.", "Gardez votre phrase privée et vos sauvegardes dans des endroits séparés.", "N’ajoutez une image à WiseHelp que si vous souhaitez réellement l’envoyer."],
    expectedResult: "Les données restent locales tant que vous ne choisissez pas explicitement un envoi.",
    aliases: ["confidentialité", "chiffrement", "données", "consentement", "image"], surfaces: ["help", "settings", "global"],
    limitations: ["Une image ajoutée manuellement à WiseHelp est envoyée au fournisseur après consentement."], features: ["privacy", "encryption", "consent"],
  },
  {
    id: "hors-ligne", groupId: "aide", locale: "fr", title: "Utiliser WiseMoney hors ligne et résoudre un blocage", route: "/help",
    summary: "Les fonctions locales et le guide restent disponibles ; WiseHelp attend le retour d’Internet.", prerequisites: ["Avoir ouvert WiseMoney une première fois en ligne."],
    steps: ["Installez WiseMoney ou ouvrez-le une première fois en ligne pour mettre les fichiers essentiels en cache.", "Hors ligne, continuez les saisies, budgets et consultations locales.", "Si une page reste bloquée, choisissez Réessayer, puis Rouvrir WiseMoney.", "N’effacez pas les données du navigateur sans sauvegarde récente."],
    expectedResult: "L’application locale reprend dès que les fichiers et le stockage de l’appareil sont disponibles.",
    aliases: ["offline", "internet", "cache", "panne", "erreur", "dépannage"], surfaces: ["help", "global"],
    limitations: ["WiseHelp et les services en ligne ont besoin d’une connexion."], features: ["offline", "troubleshooting"],
  },
];

type TranslatedTaskCopy = Pick<ProductTask, "title" | "summary" | "prerequisites" | "steps" | "expectedResult" | "aliases" | "limitations">;

const englishCopy: Record<string, TranslatedTaskCopy> = {
  "demarrage": { title: "Install and create your private space", summary: "Install WiseMoney if you want, then create the private space that protects data on this device.", prerequisites: [], steps: ["From the landing page, choose Start.", "Create your private passphrase (three random words work well; the eye icon shows what you type), confirm it, then choose Create private space.", "Check the currency and the account, then record a first movement.", "Set a first plan or choose Later.", "To install WiseMoney, use the install button at the top of the landing page, or later Settings, About WiseMoney, Install WiseMoney; otherwise continue in the browser."], expectedResult: "WiseMoney opens your private dashboard on this device.", aliases: ["start", "first use", "create space", "onboarding"], limitations: ["WiseMoney cannot recover a forgotten private passphrase."] },
  "restauration": { title: "Restore an existing space", summary: "Reopen your data on this device from an encrypted WiseMoney backup.", prerequisites: ["Have the WiseMoney export file, and its passphrase if it was protected."], steps: ["On the WiseMoney landing page, choose “I have a backup: restore it”. In the installed app, with no existing space, the restore screen appears directly.", "Under Export file, select the file exported from your other device.", "Enter the New passphrase for this device, then confirm it.", "If the export was protected, enter its passphrase under Export passphrase, if used; otherwise leave that field blank.", "Choose Restore space.", "If a space already exists on the device: open Settings, Data and backup, and select the file under Import; this replaces all existing data."], expectedResult: "The backup is imported and the restored space opens.", aliases: ["import account", "export file", "recover data", "new phone"], limitations: ["An Excel statement or calendar cannot restore the space."] },
  "phrase-privee": { title: "Open with your passphrase or device", summary: "The private passphrase remains the recovery key; face, fingerprint, or device PIN can make opening faster.", prerequisites: ["Have an existing WiseMoney space."], steps: ["Choose Open my space.", "If device unlock is on, choose Open and confirm with this device’s screen lock.", "Otherwise choose Use my private passphrase, enter it, then choose Open. The eye icon shows what you type.", "To turn it on: open Settings, Security and session, choose Turn on device unlock, enter your private passphrase, then choose Turn on."], expectedResult: "The vault unlocks locally.", aliases: ["password", "fingerprint", "face", "pin", "webauthn", "unlock"], limitations: ["Biometric options depend on the browser and device."] },
  "installation": { title: "Install WiseMoney on this device", summary: "Add WiseMoney to the home screen and open it like your other apps.", prerequisites: ["Open WiseMoney in a compatible browser."], steps: ["In WiseMoney: open Settings; under About WiseMoney, choose Install WiseMoney.", "Android: open Chrome’s menu, then choose Install app or Add to Home screen.", "iPhone or iPad: in Safari, tap Share, then Add to Home Screen.", "Computer: use the install icon in the address bar or browser menu."], expectedResult: "The WiseMoney icon appears with the device’s apps.", aliases: ["pwa", "android", "iphone", "ios", "home screen", "application"], limitations: ["The exact action depends on the browser; no app store is required."] },
  "comptes": { title: "Create and manage an account", summary: "Keep cash, mobile money, bank, and card balances separate and readable.", prerequisites: ["Open the private space."], steps: ["Open Settings (the gear icon at the top of the screen).", "Open Accounts & categories, then the Accounts tab.", "Choose New, enter the account name, type, currency, and opening balance, then choose Create Account.", "Use the pencil to edit its name or type, or the trash icon to archive it."], expectedResult: "The active account becomes available in capture and on the dashboard.", aliases: ["cash", "mobile money", "bank", "card", "opening balance"], limitations: ["Archiving keeps history and does not remove past operations."] },
  "categories": { title: "Create and organize categories", summary: "Use categories to understand spending and track budgets.", prerequisites: ["Open the private space."], steps: ["Open Settings, then Accounts & categories.", "Choose the Categories tab, then New.", "Enter the category name, then choose Create Category.", "From its row, use the pencil to rename a category or the trash icon to archive it."], expectedResult: "The category is available for transactions, budgets, and planned items.", aliases: ["classification", "expense type", "rename category"], limitations: ["A category referenced by an active item may need to stay available."] },
  "transactions": { title: "Record, correct, or delete a transaction", summary: "Add income or an expense and find it again in Activity.", prerequisites: ["Open the private space."], steps: ["Tap the + (Capture) button; the Expense / Income tab opens.", "Choose Expense or Income, enter the amount, then choose the category; the account is asked only when you have more than one, and the date defaults to today.", "Choose Add.", "To correct or delete it, open Activity, tap its row, then choose Edit transaction or Delete transaction; on Home, the pencil and trash icons under Recent movements do the same."], expectedResult: "The account balance and period indicators are recalculated.", aliases: ["income", "expense", "movement", "edit operation", "history"], limitations: ["Deleting a transaction is permanent in the current cycle.", "Only income and expenses can be edited or deleted; the account and original date do not change."] },
  "virements": { title: "Transfer between accounts and track it", summary: "Move money between two of your accounts, even when they use different currencies.", prerequisites: ["Have two active accounts; add a local exchange rate when their currencies differ."], steps: ["Tap the + (Capture) button, then the Transfer tab.", "Choose the From Account; under “Where is the money going?”, choose One of my accounts, then the To Account.", "Enter the amount and optional note; when currencies differ, check the amount the destination account will receive.", "Choose Move between my accounts, then open Activity to find the movement."], expectedResult: "The source account is debited, the destination account is credited, and the movement stays neutral in combined activity.", aliases: ["transfer", "account to account", "move money", "conversion", "track transfer"], limitations: ["Without an available rate, WiseMoney cannot record a movement between different currencies; a transfer cannot be edited after recording."] },
  "tableau-de-bord": { title: "Read the dashboard and activity", summary: "Compare available balance, income, expenses, and the difference for a selected period.", prerequisites: ["Open the private space."], steps: ["Choose the period at the top of the dashboard.", "Read “Money available today”: it is the balance of your active accounts.", "Compare Money received, Money spent, and Difference for the month.", "Open Activity to search, filter, or export the month’s movements.", "Open More about this month to see the charts, budgets, and goals."], expectedResult: "Indicators and charts follow the selected month; for a past month, the balance shown is the balance at the end of that month.", aliases: ["dashboard", "activity", "charts", "total balance", "all operations"], limitations: ["Accounts without a usable exchange rate may be excluded from the base-currency total."] },
  "budgets": { title: "Create and follow a budget", summary: "Set a category limit and follow how much has been used.", prerequisites: ["Have an active category."], steps: ["Open Plan, then Budgets.", "Choose Add budget.", "Enter the name, category, monthly limit, and period, then choose Create Budget.", "Review progress; use the budget’s archive icon when it is no longer useful."], expectedResult: "Category expenses automatically update the used percentage.", aliases: ["limit", "cap", "percentage spent"], limitations: ["A budget does not block an expense."] },
  "objectifs": { title: "Create a goal and add a contribution", summary: "Set a savings target and follow each contribution.", prerequisites: ["Open the private space."], steps: ["Open Plan, then Goals.", "Choose Add Goal, enter its name and target amount, then choose Create Savings Goal.", "To contribute, tap the + (Capture) button, then the Goal tab; choose the goal, enter the amount, then choose Add Contribution."], expectedResult: "Goal progress increases by the contribution amount.", aliases: ["saving", "fund", "contribution", "target amount"], limitations: ["A contribution tracks progress; it does not perform a real bank transfer."] },
  "depenses-prevues": { title: "Prepare and complete a planned expense", summary: "Plan a one-off purchase without changing balances before it happens.", prerequisites: ["Have an active account and category to complete the expense."], steps: ["Open Plan, then Planned expenses.", "Choose Add a planned expense, then enter the label, estimated amount, currency, category, priority, and optional due date.", "While it is pending, use Edit or Cancel.", "When it happens, choose Mark as completed, enter the actual amount, account, and effective date, then choose Confirm payment."], expectedResult: "The plan is completed and an actual transaction appears in activity.", aliases: ["future purchase", "one-off", "forecast", "complete expense"], limitations: ["A pending planned expense does not change any balance."] },
  "recurrent": { title: "Track recurring income or a payment", summary: "Prepare an operation that repeats and complete each occurrence when due.", prerequisites: ["Have an active category; an active account is needed to realise an occurrence."], steps: ["Open Plan, then Recurring Transactions.", "Choose Add Recurring, then enter the label, category, amount, direction, frequency, and start date.", "When due, choose Realise, select the account, then choose Record Occurrence.", "Use the archive icon when the item no longer repeats."], expectedResult: "The transaction is recorded and the item shows the date of its last occurrence.", aliases: ["subscription", "salary", "monthly payment", "occurrence"], limitations: ["WiseMoney never executes a bank payment automatically."] },
  "dettes": { title: "Track a debt or receivable", summary: "Record what you owe or what someone owes you, with an optional due date.", prerequisites: ["Open the private space."], steps: ["Open Plan, then Debts & Receivables.", "Choose Add, select the type (Receivable or Debt), then enter the name, motive, amount, and optional due date.", "Edit the due date from the card, then choose Save; Add to calendar appears once a due date is set.", "When payment is complete, set the item’s status to Settled."], expectedResult: "The item keeps its status and due date until settlement.", aliases: ["loan", "receive", "repay", "receivable", "due date"], limitations: ["Marking settled does not automatically create a transaction."] },
  "rappels": { title: "Configure reminders and calendar", summary: "Choose which due dates to surface on this device or export them to your calendar.", prerequisites: ["Install WiseMoney for more reliable notifications."], steps: ["Open Settings, then Reminders and calendar.", "Turn on “Enable WiseMoney reminders”, then the useful types.", "Choose Allow system notifications if wanted.", "Use Add to calendar on a due item, or Add review to calendar for the weekly review."], expectedResult: "Local reminders are prepared without amounts in their text.", aliases: ["notification", "sound", "calendar", "due date", "weekly review"], limitations: ["The browser controls exact background delivery time."] },
  "devises": { title: "Choose the base currency and exchange rates", summary: "Convert accounts in several currencies using rates you control.", prerequisites: ["Open the private space."], steps: ["Open Settings, then Money and currency.", "Choose the Default currency.", "Under Add rate, fill in From, To, and Rate, then confirm with the + button.", "Return to the dashboard to include convertible accounts in the total."], expectedResult: "WiseMoney calculates totals using locally saved rates.", aliases: ["currency", "fx", "exchange rate", "conversion"], limitations: ["WiseMoney does not download market rates automatically."] },
  "sauvegarde": { title: "Back up, export, and start a new cycle", summary: "Create a restorable file before moving devices or closing a cycle.", prerequisites: ["Open the private space."], steps: ["Open Settings, then Data and backup.", "For future restoration, choose Encrypted Export, enter a passphrase, then Encrypt & Download; keep that passphrase separately.", "Use Export CSV or Export XLSX for review, not restoration.", "To close a cycle, choose Archive and start again, download the backup and the XLSX statement, then check them before confirming."], expectedResult: "You have a restorable encrypted backup and, when requested, a readable statement.", aliases: ["backup", "export", "import", "xlsx", "reset", "cycle"], limitations: ["An Excel file is not a restorable backup."] },
  "apparence": { title: "Change language, theme, and view updates", summary: "Adapt the display without changing financial data.", prerequisites: [], steps: ["Open Settings.", "Choose Français or English under Language.", "Choose Light, Dark, or System under Appearance.", "Under About, open updates for the current version."], expectedResult: "The interface applies the preferences immediately on this device.", aliases: ["dark mode", "English", "French", "release notes", "version"], limitations: [] },
  "intelligence": { title: "Choose WiseHelp, the Assistant, or WiseLearn", summary: "WiseHelp explains the app; the Assistant analyzes your information only after consent; WiseLearn answers questions about money in general.", prerequisites: [], steps: ["Open WiseHelp with the help button at the top of the screen and ask where to find a feature or how to use it.", "To understand your own figures, open the Assistant: Settings, Optional assistant services, Open assistant (or the Assistant card on Home once a service is set up).", "Review the consent screen before sharing with any intelligent service.", "For a question about money in general, open WiseLearn: its answers do not use your figures."], expectedResult: "You use the correct assistant with a clear scope.", aliases: ["ai", "chat", "advice", "analysis", "prediction", "gemma", "wisebot", "wisehelp", "wiselearn"], limitations: ["WiseHelp cannot see the screen or vault and does not give personalized financial advice."] },
  "apprendre": { title: "Ask a financial education question", summary: "Ask a question about money; the answer draws on WiseMoney's lessons and names its source.", prerequisites: ["Open the private space, with an Internet connection."], steps: ["From Home, open the WiseLearn card.", "Choose one of the suggested questions, or type your own, then choose Ask the tutor.", "The first time, a notice appears: “Tutor answers go through Google. Nothing from your vault.” Choose OK to accept it.", "Under the answer, a Source line names the lesson and the organisation it comes from."], expectedResult: "You read a short answer, with its source.", aliases: ["financial education", "lessons", "course", "tutor", "learn", "saving", "investing", "money question"], limitations: ["Education, not advice.", "A connection is needed: the lessons are not on the phone."] },
  "securite": { title: "Understand security and privacy", summary: "Financial data stays encrypted on the device and online services remain separate.", prerequisites: [], steps: ["Lock WiseMoney after using a shared device.", "Keep the private passphrase and backups in separate places.", "Only add an image to WiseHelp when you intend to send it."], expectedResult: "Data stays local until you explicitly choose to send something.", aliases: ["privacy", "encryption", "data", "consent", "image"], limitations: ["An image manually added to WiseHelp is sent to the provider after consent."] },
  "hors-ligne": { title: "Use WiseMoney offline and recover from a problem", summary: "Local features and written help stay available; WiseHelp waits for Internet.", prerequisites: ["Open WiseMoney online at least once."], steps: ["Install WiseMoney or open it online once so essential files are cached.", "Offline, continue local capture, budgets, and review.", "If a page remains stuck, choose Try again, then Reopen WiseMoney.", "Do not clear browser data without a recent backup."], expectedResult: "The local app resumes when cached files and device storage are available.", aliases: ["offline", "internet", "cache", "failure", "error", "troubleshooting"], limitations: ["WiseHelp and online services need a connection."] },
};

const en: ProductTask[] = fr.map((task) => ({ ...task, ...englishCopy[task.id], locale: "en" }));

export const REQUIRED_HELP_FEATURES = [
  "onboarding", "vault", "backup", "import", "passphrase", "device-unlock", "pwa-install", "accounts",
  "categories", "transactions", "transfers", "dashboard", "period-comparison", "budgets", "goals",
  "planned-expenses", "recurring", "debts", "receivables", "reminders", "calendar", "currencies",
  "export", "cycle-reset", "appearance", "language", "updates", "help-chat", "financial-assistant",
  "predictions", "recommendations", "privacy", "encryption", "consent", "offline", "troubleshooting",
  "literacy",
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
