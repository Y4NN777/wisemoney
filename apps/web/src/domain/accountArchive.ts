import type { MoneyDTO } from "./financialState.ts";

/**
 * An account can be archived when its balance is zero, or when nothing has moved on it since it was
 * created: no live transaction and no transfer from or to it, so its balance is still the opening
 * balance. That opening balance was a setup mistake, not money with a history, and it leaves the
 * totals with the account. An account holding money from real movements must be emptied first, or
 * that money would vanish from the totals. The projection and the archive command share this rule,
 * so an accepted archive event always takes effect on replay.
 */
export function isAccountArchivable(
  account: { id: string; balance: MoneyDTO; initialBalance: MoneyDTO },
  transactions: Iterable<{ accountId: string }>,
  transfers: Iterable<{ fromAccountId: string; toAccountId: string | null }>,
): boolean {
  if (account.balance.minorUnits === 0) return true;
  if (
    account.balance.minorUnits !== account.initialBalance.minorUnits ||
    account.balance.currency !== account.initialBalance.currency
  ) {
    return false;
  }
  for (const transaction of transactions) {
    if (transaction.accountId === account.id) return false;
  }
  for (const transfer of transfers) {
    if (transfer.fromAccountId === account.id || transfer.toAccountId === account.id) return false;
  }
  return true;
}
