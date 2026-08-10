export type GreetingTime = "morning" | "afternoon" | "evening";

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
