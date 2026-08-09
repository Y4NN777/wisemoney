import type { TFunction } from "i18next";

type CategoryLike = {
  name: string;
  isSystemDefault: boolean;
};

const categoryKeys: Record<string, string> = {
  "Food & Dining": "foodDining",
  "Repas et alimentation": "foodDining",
  Transport: "transport",
  Housing: "housing",
  Logement: "housing",
  Utilities: "utilities",
  "Factures et services": "utilities",
  Entertainment: "entertainment",
  Loisirs: "entertainment",
  Healthcare: "healthcare",
  Santé: "healthcare",
  Education: "education",
  Éducation: "education",
  Shopping: "shopping",
  Achats: "shopping",
  "Personal Care": "personalCare",
  "Soins personnels": "personalCare",
  Insurance: "insurance",
  Assurance: "insurance",
  Subscriptions: "subscriptions",
  Abonnements: "subscriptions",
  "Gifts & Donations": "giftsDonations",
  "Cadeaux et dons": "giftsDonations",
  Travel: "travel",
  Voyages: "travel",
  Salary: "salary",
  Salaire: "salary",
  Freelance: "freelance",
  "Travail indépendant": "freelance",
  Investments: "investments",
  Investissements: "investments",
  Refunds: "refunds",
  Remboursements: "refunds",
  "Other Income": "otherIncome",
  "Autres revenus": "otherIncome",
};

export function categoryDisplayName(category: CategoryLike, t: TFunction): string {
  if (!category.isSystemDefault) return category.name;
  const key = categoryKeys[category.name];
  return key == null ? category.name : t(`systemCategories.${key}`);
}
