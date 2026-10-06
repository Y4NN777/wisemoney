import type { LiteracyLocale } from "../../src/literacy/corpus.js";

/**
 * Labelled questions that measure the tutor's retrieval (api/learn/_retrieval.test.ts). A question
 * passes when one of its `expected` lessons is among the passages sent to Gemma.
 * The five "reader-" questions are what readers wrote under LeFaso.net articles (src/literacy/starters.ts).
 * The others were written on 2026-10-06 in a beginner's words, often without the lesson's own terms,
 * to test vague questions; they are test data, not content, and Y4NN reviews them.
 */
export type RetrievalCase = { id: string; locale: LiteracyLocale; question: string; expected: string[] };

export const RETRIEVAL_EVAL: RetrievalCase[] = [
  { id: "reader-salary-with-partner", locale: "fr", question: "Gérez-vous votre salaire de manière transparente avec votre partenaire ?", expected: ["talk-about-money-at-home", "build-a-budget"] },
  { id: "reader-savings-account-or-tontine", locale: "fr", question: "Ne vaut-il pas mieux ouvrir un petit compte d’épargne dans une caisse populaire ? C’est quoi le secret de la tontine ?", expected: ["ways-to-save", "savings-groups", "savings-accounts-in-burkina"] },
  { id: "reader-lending-at-15-percent", locale: "fr", question: "Prêter à 15 %, est-ce régulier ?", expected: ["the-legal-ceiling", "what-a-loan-really-costs"] },
  { id: "reader-invest-from-burkina", locale: "fr", question: "Comment, quand et combien faut-il investir en bourse, et vers quelles organisations aller quand on est au Burkina ?", expected: ["start-from-burkina", "the-brvm", "saving-or-investing"] },
  { id: "reader-three-hundred-percent", locale: "fr", question: "Où voyez-vous qu’on peut faire 300 % de gain ?", expected: ["spot-a-scam", "risk-and-return"] },

  { id: "fr-end-of-month", locale: "fr", question: "je gagne pas beaucoup, comment faire pour que l'argent tienne jusqu'à la fin du mois ?", expected: ["build-a-budget", "stick-to-your-budget", "track-your-spending"] },
  { id: "fr-salary-gone", locale: "fr", question: "mon salaire finit toujours avant le 20, qu'est-ce que je fais mal ?", expected: ["stick-to-your-budget", "track-your-spending", "money-in-money-out"] },
  { id: "fr-need-or-want", locale: "fr", question: "c'est quoi la différence entre ce dont j'ai besoin et ce que j'ai juste envie d'acheter ?", expected: ["essential-and-non-essential"] },
  { id: "fr-market-seller", locale: "fr", question: "je vends au marché et je gagne pas pareil chaque mois, je fais comment pour prévoir ?", expected: ["irregular-income"] },
  { id: "fr-keep-my-money", locale: "fr", question: "comment je fais pour garder mon argent ?", expected: ["ways-to-save", "why-save", "emergency-fund", "pay-yourself-first"] },
  { id: "fr-sister-asks", locale: "fr", question: "ma petite sœur me demande tout le temps de l'argent, je refuse comment sans la vexer ?", expected: ["answer-requests-for-money", "spending-pressure"] },
  { id: "fr-shop-money", locale: "fr", question: "je mélange l'argent de ma boutique avec le mien, c'est grave ?", expected: ["business-money-apart"] },
  { id: "fr-nothing-aside", locale: "fr", question: "si un malheur arrive demain, j'ai rien de côté, je commence par où ?", expected: ["emergency-fund", "ways-to-face-a-risk"] },
  { id: "fr-nothing-left", locale: "fr", question: "à la fin du mois il me reste jamais rien pour mettre de côté", expected: ["pay-yourself-first", "savings-plan"] },
  { id: "fr-neighbourhood-tontine", locale: "fr", question: "la tontine du quartier, c'est fiable ou pas ?", expected: ["savings-groups", "formal-and-informal-finance"] },
  { id: "fr-mattress", locale: "fr", question: "c'est mieux de garder l'argent sous le matelas ou à la caisse ?", expected: ["ways-to-save", "savings-accounts-in-burkina", "formal-and-informal-finance"] },
  { id: "fr-buys-less", locale: "fr", question: "pourquoi avec le temps 10 000 F achètent moins qu'avant ?", expected: ["rising-prices"] },
  { id: "fr-money-grows", locale: "fr", question: "si je laisse mon argent à la banque des années, il grossit comment ?", expected: ["interest-and-time"] },
  { id: "fr-caisse-or-bank", locale: "fr", question: "c'est quoi une caisse populaire, c'est pareil qu'une banque ?", expected: ["what-microfinance-is", "what-a-bank-does"] },
  { id: "fr-papers-for-account", locale: "fr", question: "il faut quels papiers pour avoir un compte à la banque ?", expected: ["open-an-account"] },
  { id: "fr-bank-bankrupt", locale: "fr", question: "si la banque fait faillite je perds tout ?", expected: ["is-my-money-protected"] },
  { id: "fr-you-won-message", locale: "fr", question: "on m'a envoyé un message disant que j'ai gagné, ils demandent mon code orange money", expected: ["phone-and-mobile-money-fraud", "spot-a-scam"] },
  { id: "fr-send-to-village", locale: "fr", question: "envoyer de l'argent au village par téléphone, c'est sûr ?", expected: ["send-and-receive-money", "mobile-money-basics"] },
  { id: "fr-bank-fees", locale: "fr", question: "la banque m'a pris des frais que je comprends pas, je fais quoi ?", expected: ["your-rights-as-a-client", "complain-and-get-help"] },
  { id: "fr-loan-for-maquis", locale: "fr", question: "je veux un prêt pour ouvrir un maquis, je fais comment ?", expected: ["ways-to-fund-a-project", "choose-a-lender", "borrow-for-what"] },
  { id: "fr-five-percent-month", locale: "fr", question: "le monsieur dit 5 % par mois, au final je rembourse combien ?", expected: ["what-a-loan-really-costs", "the-legal-ceiling"] },
  { id: "fr-how-much-credit", locale: "fr", question: "je peux prendre un crédit de combien avec 80 000 F par mois ?", expected: ["how-much-can-you-repay"] },
  { id: "fr-three-loans", locale: "fr", question: "j'ai trois crédits et je n'arrive plus à suivre", expected: ["when-debt-becomes-too-much"] },
  { id: "fr-wedding-loan", locale: "fr", question: "emprunter pour la fête de mariage, c'est une bonne idée ?", expected: ["borrow-for-what", "spending-pressure"] },
  { id: "fr-mensualite", locale: "fr", question: "c'est quoi une mensualité ?", expected: ["words-of-credit"] },
  { id: "fr-insurance-useful", locale: "fr", question: "l'assurance, ça sert vraiment à quelque chose pour quelqu'un comme moi ?", expected: ["how-insurance-works", "ways-to-face-a-risk"] },
  { id: "fr-insurance-refuses", locale: "fr", question: "mon assurance refuse de payer, c'est normal ?", expected: ["read-and-use-a-policy", "complain-and-get-help"] },
  { id: "fr-double-money", locale: "fr", question: "un ami me propose de doubler mon argent en un mois", expected: ["spot-a-scam", "risk-and-return"] },
  { id: "fr-company-allowed", locale: "fr", question: "comment savoir si une société de placement a le droit d'exister ?", expected: ["check-before-you-trust"] },
  { id: "fr-stock-market", locale: "fr", question: "c'est quoi la bourse en vrai ?", expected: ["the-brvm", "shares"] },
  { id: "fr-sonatel-shares", locale: "fr", question: "acheter des actions de Sonatel, ça veut dire quoi exactement ?", expected: ["shares", "the-brvm"] },
  { id: "fr-radio-treasury", locale: "fr", question: "c'est quoi les bons du trésor dont on parle à la radio ?", expected: ["bonds-and-treasury-securities"] },
  { id: "fr-fifty-thousand", locale: "fr", question: "j'ai 50 000 F de côté, je peux déjà investir ?", expected: ["saving-or-investing", "invest-regularly"] },
  { id: "fr-one-basket", locale: "fr", question: "il faut pas mettre tout dans un seul placement, pourquoi ?", expected: ["spread-your-risk", "choose-your-mix"] },
  { id: "fr-sgi-cost", locale: "fr", question: "combien ça coûte d'acheter des actions avec une SGI ?", expected: ["what-investing-costs", "start-from-burkina"] },
  { id: "fr-dividend-tax", locale: "fr", question: "on paie des impôts sur les dividendes ?", expected: ["tax-on-investment-income"] },
  { id: "fr-when-old", locale: "fr", question: "quand je serai vieux, qui va me payer ?", expected: ["retirement-in-burkina"] },
  { id: "fr-iuts-payslip", locale: "fr", question: "c'est quoi l'IUTS qu'on enlève sur ma fiche de paie ?", expected: ["taxes-in-plain-words"] },
  { id: "fr-declare-business", locale: "fr", question: "mon commerce n'est pas déclaré, ça change quoi de le déclarer ?", expected: ["make-your-activity-official"] },
  { id: "fr-motorbike", locale: "fr", question: "j'ai envie d'une moto, comment je m'organise pour l'acheter ?", expected: ["set-goals", "cost-your-goals", "savings-plan"] },

  { id: "en-before-payday", locale: "en", question: "how do I stop running out of money before payday?", expected: ["stick-to-your-budget", "build-a-budget", "track-your-spending"] },
  { id: "en-savings-group-safe", locale: "en", question: "is a savings group safe?", expected: ["savings-groups", "formal-and-informal-finance"] },
  { id: "en-pin-on-phone", locale: "en", question: "someone asked for my mobile money PIN on the phone", expected: ["phone-and-mobile-money-fraud"] },
  { id: "en-loan-total", locale: "en", question: "how much will this loan cost me in total?", expected: ["what-a-loan-really-costs"] },
  { id: "en-stock-exchange", locale: "en", question: "what is a stock exchange?", expected: ["the-brvm", "shares"] },
  { id: "en-save-or-invest", locale: "en", question: "should I save or invest first?", expected: ["saving-or-investing"] },
  { id: "en-prices-rising", locale: "en", question: "prices keep going up, what does it do to my savings?", expected: ["rising-prices"] },
  { id: "en-family-asks", locale: "en", question: "my family keeps asking me for money", expected: ["answer-requests-for-money", "spending-pressure"] },
  { id: "en-bank-closes", locale: "en", question: "what happens to my money if the bank closes?", expected: ["is-my-money-protected"] },
  { id: "en-motorbike", locale: "en", question: "I want to buy a motorbike in a year", expected: ["set-goals", "cost-your-goals", "savings-plan"] },
];
