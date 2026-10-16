// The labelling guide for category suggestion (ADR-0015): one definition per default category key
// (apps/web/src/lib/categoryName.ts), used both to generate training phrases and to label them blindly.
// Rules marked "decision" are product choices Y4NN confirms; change them here, then regenerate.

export const GUIDE_VERSION = "2026-10-16.1";

/** "none" is a real class: the student learns to abstain on movements no category fits. */
export const CATEGORIES = [
  // Expenses
  { key: "foodDining", direction: "expense", fr: "Repas et alimentation", en: "Food & Dining",
    covers: "market food, groceries, street food, maquis, restaurant, kiosk, bread, water sachets, drinks with a meal, tea, coffee" },
  { key: "transport", direction: "expense", fr: "Transport", en: "Transport",
    covers: "trips inside a town: taxi, moto-taxi, bus inside a city; fuel for one's own moto or car; moto or car repair, tyres, parking" },
  { key: "housing", direction: "expense", fr: "Logement", en: "Housing",
    covers: "rent, deposit, household repairs, furniture, cooking gas bottle, cleaning products for the house" },
  { key: "utilities", direction: "expense", fr: "Factures et services", en: "Utilities",
    covers: "electricity, water, phone airtime and data bundles, mobile money and bank fees, internet box (decision: airtime and mobile money fees go here)" },
  { key: "entertainment", direction: "expense", fr: "Loisirs", en: "Entertainment",
    covers: "outings, cinema, concerts, sport matches, games, betting, drinks out with friends" },
  { key: "healthcare", direction: "expense", fr: "Santé", en: "Healthcare",
    covers: "pharmacy, medicine, clinic, hospital, lab tests, doctor, traditional healer" },
  { key: "education", direction: "expense", fr: "Éducation", en: "Education",
    covers: "school and university fees, registration, books, school supplies, courses, training, exam fees" },
  { key: "shopping", direction: "expense", fr: "Achats", en: "Shopping",
    covers: "clothes, shoes, phone or electronics purchase, accessories, household items that are not repairs" },
  { key: "personalCare", direction: "expense", fr: "Soins personnels", en: "Personal Care",
    covers: "hairdresser, barber, braids, cosmetics, soap, perfume, tailoring of one's own clothes" },
  { key: "insurance", direction: "expense", fr: "Assurance", en: "Insurance",
    covers: "health, moto, car, life or home insurance premiums" },
  { key: "subscriptions", direction: "expense", fr: "Abonnements", en: "Subscriptions",
    covers: "TV packages, streaming, apps, gym membership, any recurring paid service except phone bundles" },
  { key: "giftsDonations", direction: "expense", fr: "Cadeaux et dons", en: "Gifts & Donations",
    covers: "money sent to family, gifts, weddings, baptisms, funerals contributions, church or mosque offerings, zakat (decision: support sent to family goes here)" },
  { key: "travel", direction: "expense", fr: "Voyages", en: "Travel",
    covers: "trips between towns or countries: intercity bus, plane, hotel, travel documents" },
  // Income
  { key: "salary", direction: "income", fr: "Salaire", en: "Salary",
    covers: "monthly pay, wages, bonus from an employer, stipend from an employer" },
  { key: "freelance", direction: "income", fr: "Travail indépendant", en: "Freelance",
    covers: "payment for a job done, small-business sales, commerce, side gigs, client payment (decision: sales of one's own small business go here)" },
  { key: "investments", direction: "income", fr: "Investissements", en: "Investments",
    covers: "interest, dividends, rent received, sale of shares, investment returns" },
  { key: "refunds", direction: "income", fr: "Remboursements", en: "Refunds",
    covers: "money given back: a friend repaying a loan, a shop refund, a reimbursed expense" },
  { key: "otherIncome", direction: "income", fr: "Autres revenus", en: "Other Income",
    covers: "gifts received, money from family, scholarship, prize, tontine payout (decision: tontine payout goes here)" },
];

export const NONE = {
  key: "none",
  covers: "moves between one's own accounts (cash to mobile money, withdrawal), savings deposits, tontine contributions, loans given or taken: these belong to the Transfer or Goal tabs, not to a category",
};

/** Pairs a model confuses most easily; the generator writes phrases on both sides of each border. */
export const CONFUSABLE_PAIRS = [
  ["transport", "travel", "a trip inside one town versus a trip between towns"],
  ["utilities", "subscriptions", "airtime, data and mobile money fees versus TV, streaming or app subscriptions"],
  ["shopping", "personalCare", "buying clothes or objects versus hair, beauty and hygiene"],
  ["housing", "utilities", "rent, repairs and gas bottles versus electricity, water and phone bills"],
  ["foodDining", "entertainment", "eating and drinking as a meal versus going out for fun"],
  ["giftsDonations", "none", "money given to family or for ceremonies versus moving money between one's own accounts or savings"],
  ["freelance", "salary", "payment for a job or one's own sales versus pay from an employer"],
  ["otherIncome", "refunds", "money received as a gift versus money given back"],
  ["investments", "otherIncome", "returns on money placed versus gifts, prizes or tontine payouts"],
  ["healthcare", "insurance", "paying for care or medicine versus paying an insurance premium"],
];

/** Who writes the note; each request draws one, so the phrases cover different lives. */
export const PERSONAS = [
  "a university student living on a small allowance",
  "a market trader selling food at the market",
  "a moto-taxi driver",
  "a young civil servant paid monthly",
  "a tailor or hairdresser running a small workshop",
  "a young parent with two children at school",
  "an apprentice mechanic",
  "a farmer selling produce in town",
  "a young graduate looking for work and doing side gigs",
];

export const TOWNS = ["Ouagadougou", "Bobo-Dioulasso", "Koudougou", "Ouahigouya", "Banfora", "Fada N'Gourma"];

export const KEYS = [...CATEGORIES.map((category) => category.key), NONE.key];

/** The block every prompt carries, so the generator and the blind labeller read the same rules. */
export function guideText() {
  const lines = CATEGORIES.map((category) => `- ${category.key} (${category.direction}; ${category.fr} / ${category.en}): ${category.covers}`);
  return [...lines, `- ${NONE.key}: ${NONE.covers}`].join("\n");
}
