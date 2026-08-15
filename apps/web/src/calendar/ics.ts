export type CalendarLocale = "en" | "fr";

export type ReminderRecurrence = {
  frequency: "weekly" | "monthly" | "yearly";
  interval?: number;
  count?: number;
  until?: number;
};

export type ReminderCalendarOptions = {
  id: string;
  label: string;
  startsAt: number;
  locale: CalendarLocale;
  recurrence?: ReminderRecurrence;
  alarmMinutesBefore?: number | number[];
  createdAt?: number;
};

export type WeeklyReviewCalendarOptions = {
  firstReviewAt: number;
  locale: CalendarLocale;
  alarmMinutesBefore?: number | number[];
  createdAt?: number;
};

export type CalendarExport = {
  filename: string;
  content: string;
  blob: Blob;
};

/** Trigger a browser download for a generated calendar without retaining its URL. */
export function downloadCalendarExport(calendar: CalendarExport): void {
  const url = URL.createObjectURL(calendar.blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = calendar.filename;
  anchor.hidden = true;
  document.body.append(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    URL.revokeObjectURL(url);
  }
}

const encoder = new TextEncoder();

function assertTimestamp(value: number, field: string): void {
  if (!Number.isSafeInteger(value)) throw new Error(`ics: invalid ${field}`);
}

function formatUtc(timestamp: number): string {
  assertTimestamp(timestamp, "timestamp");
  return new Date(timestamp).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function formatFloatingLocal(timestamp: number): string {
  assertTimestamp(timestamp, "timestamp");
  const date = new Date(timestamp);
  return [
    String(date.getFullYear()).padStart(4, "0"),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
    "T",
    String(date.getHours()).padStart(2, "0"),
    String(date.getMinutes()).padStart(2, "0"),
    String(date.getSeconds()).padStart(2, "0"),
  ].join("");
}

function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

function foldLine(line: string): string {
  const segments: string[] = [];
  let segment = "";
  let byteLimit = 75;
  for (const character of line) {
    if (encoder.encode(segment + character).length > byteLimit && segment.length > 0) {
      segments.push(segment);
      segment = character;
      byteLimit = 74;
    } else {
      segment += character;
    }
  }
  segments.push(segment);
  return segments.join("\r\n ");
}

function renderCalendar(lines: string[]): string {
  return `${lines.map(foldLine).join("\r\n")}\r\n`;
}

function slugify(value: string): string {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "reminder";
}

function uidFor(value: string): string {
  const token = value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 96);
  if (token.length === 0) throw new Error("ics: invalid id");
  return `${token}@calendar.wisemoney.local`;
}

function singleAlarmLines(minutesBefore: number, locale: CalendarLocale): string[] {
  if (!Number.isSafeInteger(minutesBefore) || minutesBefore < 0 || minutesBefore > 7 * 24 * 60) {
    throw new Error("ics: invalid alarmMinutesBefore");
  }
  return [
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `TRIGGER:${minutesBefore === 0 ? "PT0M" : `-PT${minutesBefore}M`}`,
    `DESCRIPTION:${locale === "fr" ? "Ouvrir WiseMoney pour faire le point" : "Open WiseMoney to review"}`,
    "END:VALARM",
  ];
}

function normalizeAlarmMinutes(value: number | readonly number[] | undefined): number[] {
  let values: readonly number[];
  if (value == null) values = [30];
  else if (typeof value === "number") values = [value];
  else values = value;
  if (values.length === 0) throw new Error("ics: at least one alarm is required");
  const unique = [...new Set<number>(values)];
  for (const minutes of unique) {
    if (!Number.isSafeInteger(minutes) || minutes < 0 || minutes > 7 * 24 * 60) {
      throw new Error("ics: invalid alarmMinutesBefore");
    }
  }
  return unique.sort((a, b) => b - a);
}

function alarmLines(values: readonly number[], locale: CalendarLocale): string[] {
  return values.flatMap((minutes) => singleAlarmLines(minutes, locale));
}

function recurrenceLine(recurrence: ReminderRecurrence, startsAt: number): string {
  const interval = recurrence.interval ?? 1;
  if (!Number.isSafeInteger(interval) || interval < 1 || interval > 52) {
    throw new Error("ics: invalid recurrence interval");
  }
  if (recurrence.count != null && recurrence.until != null) {
    throw new Error("ics: recurrence cannot define both count and until");
  }
  const parts = [`FREQ=${recurrence.frequency.toUpperCase()}`, `INTERVAL=${interval}`];
  if (recurrence.count != null) {
    if (!Number.isSafeInteger(recurrence.count) || recurrence.count < 1 || recurrence.count > 999) {
      throw new Error("ics: invalid recurrence count");
    }
    parts.push(`COUNT=${recurrence.count}`);
  }
  if (recurrence.until != null) {
    assertTimestamp(recurrence.until, "recurrence until");
    if (recurrence.until <= startsAt) throw new Error("ics: recurrence until must follow startsAt");
    parts.push(`UNTIL=${formatUtc(recurrence.until)}`);
  }
  return `RRULE:${parts.join(";")}`;
}

function calendarExport(filename: string, lines: string[]): CalendarExport {
  const content = renderCalendar(lines);
  return {
    filename,
    content,
    blob: new Blob([content], { type: "text/calendar;charset=utf-8" }),
  };
}

function baseCalendarLines(locale: CalendarLocale, name: string): string[] {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//WiseMoney//Local reminders//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(name)}`,
    `X-WR-CALDESC:${locale === "fr" ? "Rappels locaux WiseMoney" : "WiseMoney local reminders"}`,
  ];
}

/** Build one manually downloadable dated or recurring reminder without amounts. */
export function createReminderCalendar(options: ReminderCalendarOptions): CalendarExport {
  const label = options.label.trim();
  if (label.length === 0 || label.length > 120) throw new Error("ics: invalid label");
  assertTimestamp(options.startsAt, "startsAt");
  const createdAt = options.createdAt ?? Date.now();
  assertTimestamp(createdAt, "createdAt");
  const alarmMinutes = normalizeAlarmMinutes(options.alarmMinutesBefore);
  const prefix = options.locale === "fr" ? "Rappel WiseMoney" : "WiseMoney reminder";
  const description = options.locale === "fr"
    ? "Ouvrez WiseMoney pour consulter cet élément. Aucun montant n’est inclus dans ce calendrier."
    : "Open WiseMoney to review this item. No amount is included in this calendar.";
  const lines = [
    ...baseCalendarLines(options.locale, prefix),
    "BEGIN:VEVENT",
    `UID:${uidFor(options.id)}`,
    `DTSTAMP:${formatUtc(createdAt)}`,
    `DTSTART:${formatFloatingLocal(options.startsAt)}`,
    "DURATION:PT15M",
    `SUMMARY:${escapeText(`${prefix}: ${label}`)}`,
    `DESCRIPTION:${escapeText(description)}`,
  ];
  if (options.recurrence != null) lines.push(recurrenceLine(options.recurrence, options.startsAt));
  lines.push(...alarmLines(alarmMinutes, options.locale), "END:VEVENT", "END:VCALENDAR");
  return calendarExport(`wisemoney-${slugify(label)}.ics`, lines);
}

const REVIEW_THEMES = {
  en: [
    ["Weekly activity", "Review recent transactions and confirm that each entry is correct."],
    ["Upcoming commitments", "Review planned expenses, recurring items, debts, and receivables that are due soon."],
    ["Budgets and priorities", "Review budget progress and decide which priorities need attention."],
    ["Goals and next steps", "Review your goals and choose one practical next step for the coming week."],
  ],
  fr: [
    ["Activité de la semaine", "Vérifiez les transactions récentes et confirmez que chaque saisie est correcte."],
    ["Engagements à venir", "Vérifiez les dépenses prévues, récurrents, dettes et créances bientôt à échéance."],
    ["Budgets et priorités", "Vérifiez l’avancement des budgets et les priorités qui demandent votre attention."],
    ["Objectifs et prochaine étape", "Vérifiez vos objectifs et choisissez une prochaine étape concrète pour la semaine."],
  ],
} as const;

/** Build four weekly series, offset by one week and repeating every four weeks. */
export function createWeeklyReviewCalendar(options: WeeklyReviewCalendarOptions): CalendarExport {
  assertTimestamp(options.firstReviewAt, "firstReviewAt");
  const createdAt = options.createdAt ?? Date.now();
  assertTimestamp(createdAt, "createdAt");
  const alarmMinutes = normalizeAlarmMinutes(options.alarmMinutesBefore);
  const calendarName = options.locale === "fr" ? "Revue hebdomadaire WiseMoney" : "WiseMoney weekly review";
  const lines = baseCalendarLines(options.locale, calendarName);

  REVIEW_THEMES[options.locale].forEach(([summary, description], index) => {
    const start = new Date(options.firstReviewAt);
    start.setDate(start.getDate() + index * 7);
    lines.push(
      "BEGIN:VEVENT",
      `UID:weekly-review-${index + 1}@calendar.wisemoney.local`,
      `DTSTAMP:${formatUtc(createdAt)}`,
      `DTSTART:${formatFloatingLocal(start.getTime())}`,
      "DURATION:PT20M",
      "RRULE:FREQ=WEEKLY;INTERVAL=4",
      `SUMMARY:${escapeText(`${calendarName}: ${summary}`)}`,
      `DESCRIPTION:${escapeText(description)}`,
      ...alarmLines(alarmMinutes, options.locale),
      "END:VEVENT",
    );
  });
  lines.push("END:VCALENDAR");
  return calendarExport(
    options.locale === "fr" ? "wisemoney-revue-hebdomadaire.ics" : "wisemoney-weekly-review.ics",
    lines,
  );
}
