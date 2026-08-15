import { describe, expect, it } from "vitest";
import { LocalAdmissionError, LocalAdmissionQueue, type AdmissionConfig } from "./localAdmission.ts";

class MemoryStorage {
  private readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  serialized(): string { return [...this.values.values()].join("\n"); }
}

const config: AdmissionConfig = {
  dailyUnits: 3,
  concurrency: 1,
  averageSeconds: 10,
  reservationSeconds: 45,
  processingSeconds: 120,
  waitingSeconds: 600,
};

describe("local help admission queue", () => {
  it("admits FIFO, reports position, and advances after cancellation", () => {
    const storage = new MemoryStorage();
    const queue = new LocalAdmissionQueue(storage, () => Date.parse("2026-08-14T12:00:00Z"), config);

    const first = queue.request(1);
    const second = queue.request(1);
    expect(first.status).toBe("admitted");
    expect(second).toMatchObject({ status: "waiting", position: 1, estimatedWaitSeconds: 10 });

    queue.cancel(first.id);
    expect(queue.status(second.id).status).toBe("admitted");
  });

  it("uses two units for an image and enforces the browser-local daily pool", () => {
    const storage = new MemoryStorage();
    const queue = new LocalAdmissionQueue(storage, () => Date.parse("2026-08-14T12:00:00Z"), config);

    expect(queue.request(2).remainingUnits).toBe(1);
    expect(queue.request(1).remainingUnits).toBe(0);
    expect(() => queue.request(1)).toThrowError(new LocalAdmissionError("quota"));
    expect(storage.serialized()).not.toContain("question");
    expect(storage.serialized()).not.toContain("data:image");
  });

  it("refunds an expired reservation and resets at midnight UTC", () => {
    const storage = new MemoryStorage();
    let now = Date.parse("2026-08-14T23:59:00Z");
    const queue = new LocalAdmissionQueue(storage, () => now, config);
    const ticket = queue.request(2);

    now += 46_000;
    expect(queue.status(ticket.id)).toMatchObject({ status: "expired", remainingUnits: 3 });

    now = Date.parse("2026-08-15T00:00:01Z");
    expect(queue.request(2)).toMatchObject({ status: "admitted", remainingUnits: 1, resetAt: "2026-08-16T00:00:00.000Z" });
  });

  it("refunds a provider failure but keeps successful usage", () => {
    const storage = new MemoryStorage();
    const queue = new LocalAdmissionQueue(storage, () => Date.parse("2026-08-14T12:00:00Z"), config);
    const failed = queue.request(1);
    queue.begin(failed.id);
    expect(queue.finish(failed.id, false).remainingUnits).toBe(3);

    const successful = queue.request(1);
    queue.begin(successful.id);
    expect(queue.finish(successful.id, true).remainingUnits).toBe(2);
  });

  it("refunds a processing request when the user cancels it", () => {
    const storage = new MemoryStorage();
    const queue = new LocalAdmissionQueue(storage, () => Date.parse("2026-08-14T12:00:00Z"), config);
    const ticket = queue.request(2);
    queue.begin(ticket.id);

    expect(queue.cancel(ticket.id)).toMatchObject({ status: "cancelled", remainingUnits: 3 });
  });

  it("recovers from corrupt local admission state", () => {
    const storage = new MemoryStorage();
    storage.setItem("wisemoney.help.admission.v1", "not-json");
    const queue = new LocalAdmissionQueue(storage, () => Date.parse("2026-08-14T12:00:00Z"), config);

    expect(queue.request(1)).toMatchObject({ status: "admitted", remainingUnits: 2 });
  });
});
