import { afterEach, describe, expect, it, vi } from "vitest";
import { createReminderCalendar, createWeeklyReviewCalendar, downloadCalendarExport } from "./ics.ts";

const createdAt = Date.UTC(2026, 7, 15, 10, 0, 0);
const startsAt = new Date(2026, 7, 17, 18, 30, 0).getTime();

afterEach(() => vi.unstubAllGlobals());

describe("ICS calendar exports", () => {
  it("creates four offset weekly-review series rotating every four weeks", () => {
    const calendar = createWeeklyReviewCalendar({
      firstReviewAt: startsAt,
      locale: "fr",
      alarmMinutesBefore: [10_080, 2_880, 2_880],
      createdAt,
    });

    expect(calendar.filename).toBe("wisemoney-revue-hebdomadaire.ics");
    expect(calendar.blob.type).toBe("text/calendar;charset=utf-8");
    expect(calendar.content.match(/BEGIN:VEVENT/g)).toHaveLength(4);
    expect(calendar.content.match(/RRULE:FREQ=WEEKLY;INTERVAL=4/g)).toHaveLength(4);
    expect(calendar.content).toContain("SUMMARY:Revue hebdomadaire WiseMoney: Activité de la semaine");
    expect(calendar.content).toContain("SUMMARY:Revue hebdomadaire WiseMoney: Engagements à venir");
    expect(calendar.content.match(/BEGIN:VALARM/g)).toHaveLength(8);
    expect(calendar.content.match(/TRIGGER:-PT10080M/g)).toHaveLength(4);
    expect(calendar.content.match(/TRIGGER:-PT2880M/g)).toHaveLength(4);
    expect(calendar.content).not.toMatch(/(?<!\r)\n/);
  });

  it("creates a bilingual dated or recurring reminder with VALARM and no amount field", () => {
    const recurring = createReminderCalendar({
      id: "planned-expense-1",
      label: "Révision moto",
      startsAt,
      locale: "fr",
      recurrence: { frequency: "monthly", interval: 2, count: 6 },
      alarmMinutesBefore: [1_440, 60, 60],
      createdAt,
    });
    const dated = createReminderCalendar({
      id: "debt-2",
      label: "Client invoice",
      startsAt,
      locale: "en",
      createdAt,
    });

    expect(recurring.content).toContain("SUMMARY:Rappel WiseMoney: Révision moto");
    expect(recurring.content).toContain("RRULE:FREQ=MONTHLY;INTERVAL=2;COUNT=6");
    expect(recurring.content).toContain("TRIGGER:-PT1440M");
    expect(recurring.content).toContain("TRIGGER:-PT60M");
    expect(recurring.content.match(/BEGIN:VALARM/g)).toHaveLength(2);
    expect(recurring.content).not.toContain("minorUnits");
    expect(recurring.content).not.toContain("XOF");
    expect(dated.content).toContain("SUMMARY:WiseMoney reminder: Client invoice");
    expect(dated.content).not.toContain("RRULE:");
    expect(dated.content).toContain("TRIGGER:-PT30M");
  });

  it("escapes injected calendar syntax and folds every physical line to 75 UTF-8 bytes", () => {
    const calendar = createReminderCalendar({
      id: "safe-id",
      label: `Long label, with; separators\nand ${"é".repeat(40)} END:VEVENT`,
      startsAt,
      locale: "en",
      createdAt,
    });

    expect(calendar.content).toContain("Long label\\, with\\; separators\\nand");
    expect(calendar.content.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    for (const line of calendar.content.split("\r\n").filter(Boolean)) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
  });

  it("rejects ambiguous or invalid recurrence bounds", () => {
    expect(() => createReminderCalendar({
      id: "bad-recurrence",
      label: "Review",
      startsAt,
      locale: "en",
      recurrence: { frequency: "weekly", count: 3, until: startsAt + 10_000 },
    })).toThrow(/both count and until/);
  });

  it("downloads a calendar through a short-lived object URL", () => {
    const click = vi.fn();
    const remove = vi.fn();
    const append = vi.fn();
    const anchor = { href: "", download: "", hidden: false, click, remove };
    const createObjectURL = vi.fn().mockReturnValue("blob:calendar");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("document", { createElement: vi.fn().mockReturnValue(anchor), body: { append } });
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
    const calendar = createReminderCalendar({
      id: "download-1",
      label: "Review",
      startsAt,
      locale: "en",
      createdAt,
    });

    downloadCalendarExport(calendar);

    expect(anchor).toMatchObject({ href: "blob:calendar", download: "wisemoney-review.ics", hidden: true });
    expect(append).toHaveBeenCalledWith(anchor);
    expect(click).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:calendar");
  });
});
