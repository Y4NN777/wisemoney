import { describe, expect, it, vi } from "vitest";
import {
  REMINDER_QUEUE_UPDATED_MESSAGE,
  isReminderWorkerMessage,
  notificationFor,
  notifyReminderQueueUpdated,
  processDueReminders,
  registerReminderPeriodicSync,
  type LocalReminder,
  type ReminderQueueStorage,
} from "./reminderQueue.ts";

const dueReminder: LocalReminder = {
  kind: "financial",
  id: "planned:expense-1:2026-08-15",
  label: "Révision moto",
  triggerAt: 1_755_216_000_000,
  expiresAt: 1_755_302_400_000,
  locale: "fr",
  href: "/capture",
};

function fakeStorage(reminders: LocalReminder[]): ReminderQueueStorage & {
  complete: ReturnType<typeof vi.fn>;
  release: ReturnType<typeof vi.fn>;
  prune: ReturnType<typeof vi.fn>;
} {
  return {
    enqueue: vi.fn().mockResolvedValue("queued"),
    replaceAll: vi.fn().mockResolvedValue(undefined),
    replaceScope: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
    claimDue: vi.fn().mockResolvedValue(reminders),
    complete: vi.fn().mockResolvedValue(undefined),
    release: vi.fn().mockResolvedValue(undefined),
    prune: vi.fn().mockResolvedValue(undefined),
  };
}

describe("local reminder queue processing", () => {
  it("completes delivered reminders and releases failed claims for retry", async () => {
    const second = { ...dueReminder, id: "debt:invoice-2", label: "Facture client" };
    const storage = fakeStorage([dueReminder, second]);
    const notify = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("permission denied"));

    const result = await processDueReminders(storage, notify, 1_755_216_000_000);

    expect(result).toEqual({ claimed: 2, delivered: 1, failed: 1 });
    expect(storage.prune).toHaveBeenCalledWith(1_755_216_000_000);
    expect(storage.complete).toHaveBeenCalledWith(dueReminder.id, 1_755_216_000_000);
    expect(storage.release).toHaveBeenCalledWith(second.id);
  });

  it("creates localized, deduplicated notification data with app-only navigation", () => {
    const french = notificationFor(dueReminder);
    const english = notificationFor({ ...dueReminder, locale: "en" });

    expect(french).toMatchObject({
      title: "Rappel WiseMoney",
      options: {
        body: "À vérifier : Révision moto",
        tag: `wisemoney-reminder:${dueReminder.id}`,
        data: { href: "/capture" },
      },
    });
    expect(english.title).toBe("WiseMoney reminder");
    expect(english.options.body).toBe("Review: Révision moto");
    expect(french.options).not.toHaveProperty("amount");
  });

  it("keeps WiseBot notifications generic and silent", () => {
    const coach = notificationFor({
      ...dueReminder,
      kind: "coach",
      id: "coach:weekly-dashboard",
      label: "Un repère rapide pour mieux lire votre tableau de bord",
      href: "/help?coachTip=tableau-de-bord#tableau-de-bord",
    });

    expect(coach).toMatchObject({
      title: "Une aide WiseMoney",
      options: {
        body: "Un repère rapide pour mieux lire votre tableau de bord",
        silent: true,
        data: { href: "/help?coachTip=tableau-de-bord#tableau-de-bord", kind: "coach" },
      },
    });
  });

  it("does not notify duplicate or expired claims", async () => {
    const expired = { ...dueReminder, id: "expired", expiresAt: dueReminder.triggerAt };
    const storage = fakeStorage([dueReminder, { ...dueReminder }, expired]);
    const notify = vi.fn().mockResolvedValue(undefined);

    const result = await processDueReminders(storage, notify, dueReminder.triggerAt);

    expect(result).toEqual({ claimed: 3, delivered: 1, failed: 0 });
    expect(notify).toHaveBeenCalledOnce();
    expect(storage.remove).toHaveBeenCalledWith("expired");
  });

  it("recognizes queue-update messages and wakes the active worker", () => {
    const postMessage = vi.fn();
    vi.stubGlobal("navigator", {
      serviceWorker: { controller: { postMessage } },
    });

    expect(isReminderWorkerMessage({ type: REMINDER_QUEUE_UPDATED_MESSAGE })).toBe(true);
    expect(isReminderWorkerMessage({ type: "other" })).toBe(false);
    expect(notifyReminderQueueUpdated()).toBe(true);
    expect(postMessage).toHaveBeenCalledWith({ type: REMINDER_QUEUE_UPDATED_MESSAGE });

    vi.unstubAllGlobals();
  });

  it("registers periodic processing only when the browser exposes it", async () => {
    const register = vi.fn().mockResolvedValue(undefined);
    const supported = { periodicSync: { register } } as unknown as ServiceWorkerRegistration;
    const unsupported = {} as ServiceWorkerRegistration;

    await expect(registerReminderPeriodicSync(supported, 60_000)).resolves.toBe(true);
    expect(register).toHaveBeenCalledWith("wisemoney-reminders", { minInterval: 60_000 });
    await expect(registerReminderPeriodicSync(unsupported)).resolves.toBe(false);
  });
});
