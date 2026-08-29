export const REMINDER_QUEUE_UPDATED_MESSAGE = "WISEMONEY_REMINDER_QUEUE_UPDATED";
export const REMINDER_PERIODIC_SYNC_TAG = "wisemoney-reminders";

const DATABASE_NAME = "WiseMoneyReminderQueue";
const DATABASE_VERSION = 2;
const REMINDER_STORE = "reminders";
const DELIVERY_STORE = "deliveries";
const DEFAULT_CLAIM_LEASE_MS = 5 * 60 * 1000;
const DEFAULT_PERIODIC_INTERVAL_MS = 12 * 60 * 60 * 1000;

export type ReminderLocale = "en" | "fr";
export type ReminderKind = "financial" | "coach";

/**
 * Plain, non-financial notification copy. Callers deliberately cannot attach an
 * amount or vault payload: the service worker can run while the vault is locked.
 */
export type LocalReminder = {
  kind: ReminderKind;
  id: string;
  label: string;
  triggerAt: number;
  expiresAt: number;
  locale: ReminderLocale;
  href: string;
};

type StoredReminder = LocalReminder & {
  claimUntil: number | null;
};

type DeliveryReceipt = {
  id: string;
  deliveredAt: number;
  expiresAt: number;
};

export type ReminderQueueStorage = {
  enqueue: (reminder: LocalReminder) => Promise<"queued" | "duplicate">;
  replaceAll: (reminders: readonly LocalReminder[]) => Promise<void>;
  replaceScope: (kind: ReminderKind, reminders: readonly LocalReminder[]) => Promise<void>;
  remove: (id: string) => Promise<void>;
  claimDue: (now: number, limit?: number) => Promise<LocalReminder[]>;
  complete: (id: string, deliveredAt: number) => Promise<void>;
  release: (id: string) => Promise<void>;
  prune: (now: number) => Promise<void>;
};

export type ReminderProcessingResult = {
  claimed: number;
  delivered: number;
  failed: number;
};

export type ReminderWorkerMessage = {
  type: typeof REMINDER_QUEUE_UPDATED_MESSAGE;
};

function requestValue<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Reminder queue request failed"));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("Reminder queue transaction aborted"));
    transaction.onerror = () => reject(transaction.error ?? new Error("Reminder queue transaction failed"));
  });
}

function validateReminder(reminder: LocalReminder): LocalReminder {
  const id = reminder.id.trim();
  const label = reminder.label.trim();
  if (!/^[a-zA-Z0-9._:%-]{1,120}$/.test(id)) throw new Error("reminderQueue: invalid id");
  if (label.length === 0 || label.length > 120) throw new Error("reminderQueue: invalid label");
  if (!Number.isSafeInteger(reminder.triggerAt)) throw new Error("reminderQueue: invalid triggerAt");
  if (!Number.isSafeInteger(reminder.expiresAt) || reminder.expiresAt <= reminder.triggerAt) {
    throw new Error("reminderQueue: invalid expiresAt");
  }
  if (reminder.locale !== "en" && reminder.locale !== "fr") {
    throw new Error("reminderQueue: invalid locale");
  }
  if (reminder.kind !== "financial" && reminder.kind !== "coach") {
    throw new Error("reminderQueue: invalid kind");
  }
  if (!/^\/(?!\/)/.test(reminder.href)) throw new Error("reminderQueue: href must be an app-relative path");
  return { ...reminder, id, label };
}

export class IndexedDbReminderQueue implements ReminderQueueStorage {
  private databasePromise: Promise<IDBDatabase> | null = null;

  constructor(
    private readonly factory: IDBFactory = indexedDB,
    private readonly claimLeaseMs = DEFAULT_CLAIM_LEASE_MS,
  ) {}

  private openDatabase(): Promise<IDBDatabase> {
    if (this.databasePromise != null) return this.databasePromise;
    this.databasePromise = new Promise((resolve, reject) => {
      const request = this.factory.open(DATABASE_NAME, DATABASE_VERSION);
      request.onupgradeneeded = (event) => {
        const database = request.result;
        if (!database.objectStoreNames.contains(REMINDER_STORE)) {
          const reminders = database.createObjectStore(REMINDER_STORE, { keyPath: "id" });
          reminders.createIndex("triggerAt", "triggerAt");
        }
        if (!database.objectStoreNames.contains(DELIVERY_STORE)) {
          const deliveries = database.createObjectStore(DELIVERY_STORE, { keyPath: "id" });
          deliveries.createIndex("expiresAt", "expiresAt");
        }
        if (event.oldVersion < 2 && database.objectStoreNames.contains(REMINDER_STORE)) {
          const cursorRequest = request.transaction?.objectStore(REMINDER_STORE).openCursor();
          if (cursorRequest != null) {
            cursorRequest.onsuccess = () => {
              const cursor = cursorRequest.result;
              if (cursor == null) return;
              cursor.update({ ...(cursor.value as object), kind: "financial" });
              cursor.continue();
            };
          }
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Unable to open reminder queue"));
      request.onblocked = () => reject(new Error("Reminder queue upgrade is blocked"));
    });
    return this.databasePromise;
  }

  async enqueue(reminder: LocalReminder): Promise<"queued" | "duplicate"> {
    const normalized = validateReminder(reminder);
    const database = await this.openDatabase();
    const transaction = database.transaction([REMINDER_STORE, DELIVERY_STORE], "readwrite");
    const reminders = transaction.objectStore(REMINDER_STORE);
    const deliveries = transaction.objectStore(DELIVERY_STORE);
    let outcome: "queued" | "duplicate" = "queued";
    const receiptRequest = deliveries.get(normalized.id) as IDBRequest<DeliveryReceipt | undefined>;
    receiptRequest.onsuccess = () => {
      const receipt = receiptRequest.result;
      if (receipt != null && receipt.expiresAt > Date.now()) {
        outcome = "duplicate";
        return;
      }
      if (receipt != null) deliveries.delete(normalized.id);
      reminders.put({ ...normalized, claimUntil: null } satisfies StoredReminder);
    };
    await transactionDone(transaction);
    return outcome;
  }

  async replaceAll(nextReminders: readonly LocalReminder[]): Promise<void> {
    await this.replaceScope("financial", nextReminders);
  }

  async replaceScope(kind: ReminderKind, nextReminders: readonly LocalReminder[]): Promise<void> {
    const normalized = nextReminders.map(validateReminder);
    if (normalized.some((reminder) => reminder.kind !== kind)) {
      throw new Error("reminderQueue: replacement kind mismatch");
    }
    if (new Set(normalized.map((reminder) => reminder.id)).size !== normalized.length) {
      throw new Error("reminderQueue: duplicate ids in replacement");
    }
    const database = await this.openDatabase();
    const transaction = database.transaction([REMINDER_STORE, DELIVERY_STORE], "readwrite");
    const reminders = transaction.objectStore(REMINDER_STORE);
    const deliveries = transaction.objectStore(DELIVERY_STORE);
    const [existing, receipts] = await Promise.all([
      requestValue(reminders.getAll() as IDBRequest<StoredReminder[]>),
      requestValue(deliveries.getAll() as IDBRequest<DeliveryReceipt[]>),
    ]);
    const now = Date.now();
    const existingClaims = new Map(existing.map((reminder) => [reminder.id, reminder.claimUntil]));
    const deliveredIds = new Set(receipts.filter((receipt) => receipt.expiresAt > now).map((receipt) => receipt.id));
    for (const reminder of existing) if (reminder.kind === kind) reminders.delete(reminder.id);
    for (const receipt of receipts) if (receipt.expiresAt <= now) deliveries.delete(receipt.id);
    for (const reminder of normalized) {
      if (deliveredIds.has(reminder.id)) continue;
      reminders.put({
        ...reminder,
        claimUntil: existingClaims.get(reminder.id) ?? null,
      } satisfies StoredReminder);
    }
    await transactionDone(transaction);
  }

  async remove(id: string): Promise<void> {
    const database = await this.openDatabase();
    const transaction = database.transaction(REMINDER_STORE, "readwrite");
    transaction.objectStore(REMINDER_STORE).delete(id);
    await transactionDone(transaction);
  }

  async claimDue(now: number, limit = 20): Promise<LocalReminder[]> {
    if (!Number.isSafeInteger(now)) throw new Error("reminderQueue: invalid processing time");
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error("reminderQueue: invalid claim limit");
    const database = await this.openDatabase();
    const transaction = database.transaction([REMINDER_STORE, DELIVERY_STORE], "readwrite");
    const reminders = transaction.objectStore(REMINDER_STORE);
    const deliveries = transaction.objectStore(DELIVERY_STORE);
    const [due, receipts] = await Promise.all([
      requestValue(reminders.index("triggerAt").getAll(IDBKeyRange.upperBound(now)) as IDBRequest<StoredReminder[]>),
      requestValue(deliveries.getAll() as IDBRequest<DeliveryReceipt[]>),
    ]);
    const deliveredIds = new Set(receipts.filter((receipt) => receipt.expiresAt > now).map((receipt) => receipt.id));
    const claimed: LocalReminder[] = [];

    for (const receipt of receipts) {
      if (receipt.expiresAt <= now) deliveries.delete(receipt.id);
    }
    for (const reminder of due) {
      if (reminder.expiresAt <= now || deliveredIds.has(reminder.id)) {
        reminders.delete(reminder.id);
        continue;
      }
      if (reminder.claimUntil != null && reminder.claimUntil > now) continue;
      if (claimed.length >= limit) break;
      reminders.put({ ...reminder, claimUntil: now + this.claimLeaseMs } satisfies StoredReminder);
      claimed.push({
        kind: reminder.kind,
        id: reminder.id,
        label: reminder.label,
        triggerAt: reminder.triggerAt,
        expiresAt: reminder.expiresAt,
        locale: reminder.locale,
        href: reminder.href,
      });
    }
    await transactionDone(transaction);
    return claimed;
  }

  async complete(id: string, deliveredAt: number): Promise<void> {
    const database = await this.openDatabase();
    const transaction = database.transaction([REMINDER_STORE, DELIVERY_STORE], "readwrite");
    const reminders = transaction.objectStore(REMINDER_STORE);
    const deliveries = transaction.objectStore(DELIVERY_STORE);
    const request = reminders.get(id) as IDBRequest<StoredReminder | undefined>;
    request.onsuccess = () => {
      const reminder = request.result;
      if (reminder == null) return;
      deliveries.put({ id, deliveredAt, expiresAt: reminder.expiresAt } satisfies DeliveryReceipt);
      reminders.delete(id);
    };
    await transactionDone(transaction);
  }

  async release(id: string): Promise<void> {
    const database = await this.openDatabase();
    const transaction = database.transaction(REMINDER_STORE, "readwrite");
    const reminders = transaction.objectStore(REMINDER_STORE);
    const request = reminders.get(id) as IDBRequest<StoredReminder | undefined>;
    request.onsuccess = () => {
      if (request.result != null) reminders.put({ ...request.result, claimUntil: null } satisfies StoredReminder);
    };
    await transactionDone(transaction);
  }

  async prune(now: number): Promise<void> {
    const database = await this.openDatabase();
    const transaction = database.transaction([REMINDER_STORE, DELIVERY_STORE], "readwrite");
    const reminders = transaction.objectStore(REMINDER_STORE);
    const deliveries = transaction.objectStore(DELIVERY_STORE);
    const [queued, receipts] = await Promise.all([
      requestValue(reminders.getAll() as IDBRequest<StoredReminder[]>),
      requestValue(deliveries.getAll() as IDBRequest<DeliveryReceipt[]>),
    ]);
    for (const reminder of queued) if (reminder.expiresAt <= now) reminders.delete(reminder.id);
    for (const receipt of receipts) if (receipt.expiresAt <= now) deliveries.delete(receipt.id);
    await transactionDone(transaction);
  }
}

let defaultStorage: ReminderQueueStorage | null = null;

export function getReminderQueueStorage(): ReminderQueueStorage {
  defaultStorage ??= new IndexedDbReminderQueue();
  return defaultStorage;
}

export function isReminderWorkerMessage(value: unknown): value is ReminderWorkerMessage {
  return value != null && typeof value === "object" &&
    (value as Partial<ReminderWorkerMessage>).type === REMINDER_QUEUE_UPDATED_MESSAGE;
}

export async function processDueReminders(
  storage: ReminderQueueStorage,
  notify: (reminder: LocalReminder) => Promise<void>,
  now = Date.now(),
): Promise<ReminderProcessingResult> {
  await storage.prune(now);
  const claimed = await storage.claimDue(now);
  const seen = new Set<string>();
  const reminders: LocalReminder[] = [];
  for (const reminder of claimed) {
    if (reminder.expiresAt <= now) {
      await storage.remove(reminder.id);
      continue;
    }
    if (seen.has(reminder.id)) continue;
    seen.add(reminder.id);
    reminders.push(reminder);
  }
  let delivered = 0;
  let failed = 0;
  for (const reminder of reminders) {
    try {
      await notify(reminder);
      await storage.complete(reminder.id, now);
      delivered += 1;
    } catch {
      await storage.release(reminder.id);
      failed += 1;
    }
  }
  return { claimed: claimed.length, delivered, failed };
}

export function notificationFor(reminder: LocalReminder): { title: string; options: NotificationOptions } {
  if (reminder.kind === "coach") {
    return {
      title: reminder.locale === "fr" ? "Une aide WiseMoney" : "A WiseMoney tip",
      options: {
        body: reminder.label,
        icon: "/icons/wisemoney-icon-192.png",
        tag: `wisemoney-coach:${reminder.id}`,
        silent: true,
        data: { href: reminder.href, kind: reminder.kind },
      },
    };
  }
  return {
    title: reminder.locale === "fr" ? "Rappel WiseMoney" : "WiseMoney reminder",
    options: {
      body: reminder.locale === "fr" ? `À vérifier : ${reminder.label}` : `Review: ${reminder.label}`,
      icon: "/icons/wisemoney-icon-192.png",
      tag: `wisemoney-reminder:${reminder.id}`,
      data: { href: reminder.href, kind: reminder.kind },
    },
  };
}

export function notifyReminderQueueUpdated(registration?: ServiceWorkerRegistration): boolean {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return false;
  const worker = navigator.serviceWorker.controller ?? registration?.active ?? registration?.waiting;
  if (worker == null) return false;
  worker.postMessage({ type: REMINDER_QUEUE_UPDATED_MESSAGE } satisfies ReminderWorkerMessage);
  return true;
}

export async function enqueueLocalReminder(
  reminder: LocalReminder,
  storage: ReminderQueueStorage = getReminderQueueStorage(),
  registration?: ServiceWorkerRegistration,
): Promise<"queued" | "duplicate"> {
  const result = await storage.enqueue(reminder);
  if (result === "queued") notifyReminderQueueUpdated(registration);
  return result;
}

type RegistrationWithPeriodicSync = ServiceWorkerRegistration & {
  periodicSync?: {
    register: (tag: string, options: { minInterval: number }) => Promise<void>;
  };
};

export async function registerReminderPeriodicSync(
  registration: ServiceWorkerRegistration,
  minInterval = DEFAULT_PERIODIC_INTERVAL_MS,
): Promise<boolean> {
  const periodicSync = (registration as RegistrationWithPeriodicSync).periodicSync;
  if (periodicSync == null) return false;
  try {
    await periodicSync.register(REMINDER_PERIODIC_SYNC_TAG, { minInterval });
    return true;
  } catch {
    return false;
  }
}
