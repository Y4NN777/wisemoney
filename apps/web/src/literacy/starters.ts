import type { LiteracyLocale } from "./corpus.js";

/**
 * Starter questions on the Learn page. Y4NN rejected invented ones ("I don't think that will be the
 * question I will be asking if I know nothing about financial literacy"), so these are what readers
 * in Burkina Faso actually wrote under LeFaso.net articles (research notes R3-4, collected
 * 2026-10-03). `question.fr` keeps the reader's wording with spelling tidied; `question.en` is a
 * translation; `origin` records the author's pen name, date and page for traceability.
 */
export type LiteracyStarter = {
  id: string;
  question: Record<LiteracyLocale, string>;
  unitIds: string[];
  origin: { author: string; date: string; url: string };
};

export const LITERACY_STARTERS: LiteracyStarter[] = [
  {
    id: "salary-with-partner",
    question: {
      fr: "Gérez-vous votre salaire de manière transparente avec votre partenaire ?",
      en: "Do you manage your pay openly with your partner?",
    },
    unitIds: ["talk-about-money-at-home", "build-a-budget"],
    origin: { author: "Nêkobi", date: "2014-09-20", url: "https://lefaso.net/spip.php?article60886" },
  },
  {
    id: "savings-account-or-tontine",
    question: {
      fr: "Ne vaut-il pas mieux ouvrir un petit compte d’épargne dans une caisse populaire ? C’est quoi le secret de la tontine ?",
      en: "Isn’t it better to open a small savings account at a caisse populaire? What is the secret of the tontine?",
    },
    unitIds: ["ways-to-save", "savings-groups", "savings-accounts-in-burkina"],
    origin: { author: "Eric", date: "2020-06-18", url: "https://lefaso.net/spip.php?article97527" },
  },
  {
    id: "lending-at-15-percent",
    question: {
      fr: "Prêter à 15 %, est-ce régulier ?",
      en: "Lending at 15%: is that allowed?",
    },
    unitIds: ["the-legal-ceiling", "what-a-loan-really-costs"],
    origin: { author: "Luluan", date: "2012-06-01", url: "https://lefaso.net/spip.php?article48314" },
  },
  {
    id: "invest-from-burkina",
    question: {
      fr: "Comment, quand et combien faut-il investir en bourse, et vers quelles organisations aller quand on est au Burkina ?",
      en: "How, when and how much should you invest on the stock exchange, and where do you go when you live in Burkina?",
    },
    unitIds: ["start-from-burkina", "the-brvm", "saving-or-investing"],
    origin: { author: "Hebie", date: "2018-04-10", url: "https://lefaso.net/spip.php?article82884" },
  },
  {
    id: "three-hundred-percent",
    question: {
      fr: "Où voyez-vous qu’on peut faire 300 % de gain ?",
      en: "Where do you see anyone making a 300% gain?",
    },
    unitIds: ["spot-a-scam", "risk-and-return"],
    origin: { author: "enfant de bousse", date: "2019-11-24", url: "https://lefaso.net/spip.php?article93324" },
  },
];
