export type GreetingTime = "morning" | "afternoon" | "evening";

export const GREETING_MESSAGE_COUNT = 14;

export function getGreetingTime(date: Date): GreetingTime {
  const hour = date.getHours();
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}

export function getDailyGreetingIndex(date: Date, messageCount: number): number {
  if (messageCount <= 0) return 0;
  const localDay = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000);
  return localDay % messageCount;
}

export function getNextGreetingRefreshAt(date: Date): Date {
  const nextRefresh = new Date(date);
  const hour = date.getHours();

  if (hour < 12) {
    nextRefresh.setHours(12, 0, 0, 0);
  } else if (hour < 18) {
    nextRefresh.setHours(18, 0, 0, 0);
  } else {
    nextRefresh.setDate(nextRefresh.getDate() + 1);
    nextRefresh.setHours(0, 0, 0, 0);
  }

  return nextRefresh;
}
