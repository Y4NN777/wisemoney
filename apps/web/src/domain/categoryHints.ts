/**
 * Storage-level hints about the seeded default categories.
 *
 * Categories carry no direction field (INV-EVT-03 shape), but the seeding set is
 * split by direction in code. Pickers use these storage-level (English) names to
 * keep income categories out of expense mode. Single source shared by the
 * seeding logic and the capture pickers.
 */
export const DEFAULT_INCOME_CATEGORY_NAMES: readonly string[] = [
  "Salary",
  "Freelance",
  "Investments",
  "Refunds",
  "Other Income",
];
