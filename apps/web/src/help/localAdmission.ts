import type { HelpTicket, TicketState } from "./chatClient.ts";

const STATE_KEY = "wisemoney.help.admission.v1";
const LOCK_NAME = "wisemoney-help-admission";
const FALLBACK_LOCK_KEY = "wisemoney.help.admission.lock.v1";
const CHANNEL_NAME = "wisemoney-help-admission-events";

type StoredTicket = {
  id: string;
  status: TicketState;
  cost: 1 | 2;
  createdAt: number;
  leaseUntil?: number;
};

type AdmissionState = {
  version: 1;
  day: string;
  usedUnits: number;
  tickets: StoredTicket[];
};

export type AdmissionConfig = {
  dailyUnits: number;
  concurrency: number;
  averageSeconds: number;
  reservationSeconds: number;
  processingSeconds: number;
  waitingSeconds: number;
};

export class LocalAdmissionError extends Error {
  constructor(readonly reason: "quota" | "expired" | "not-admitted") {
    super(reason);
  }
}

const DEFAULT_CONFIG: AdmissionConfig = {
  dailyUnits: 20,
  concurrency: 1,
  averageSeconds: 18,
  reservationSeconds: 45,
  processingSeconds: 120,
  waitingSeconds: 600,
};

function positiveInteger(value: string | undefined, fallback: number, maximum: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= maximum ? parsed : fallback;
}

export function localAdmissionConfig(): AdmissionConfig {
  return {
    ...DEFAULT_CONFIG,
    dailyUnits: positiveInteger(import.meta.env.VITE_HELP_DAILY_UNITS, DEFAULT_CONFIG.dailyUnits, 100),
    concurrency: positiveInteger(import.meta.env.VITE_HELP_LOCAL_CONCURRENCY, DEFAULT_CONFIG.concurrency, 8),
  };
}

function utcDay(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function nextUtcMidnight(timestamp: number): string {
  const date = new Date(timestamp);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1)).toISOString();
}

export class LocalAdmissionQueue {
  constructor(
    private readonly storage: Pick<Storage, "getItem" | "setItem">,
    private readonly now: () => number = Date.now,
    private readonly config: AdmissionConfig = DEFAULT_CONFIG,
  ) {}

  request(cost: 1 | 2): HelpTicket {
    const state = this.loadAndAdvance();
    if (state.usedUnits + cost > this.config.dailyUnits) throw new LocalAdmissionError("quota");
    const ticket: StoredTicket = {
      id: crypto.randomUUID(),
      status: "waiting",
      cost,
      createdAt: this.now(),
    };
    state.usedUnits += cost;
    state.tickets.push(ticket);
    this.advance(state);
    const result = this.present(state, ticket.id);
    this.save(state);
    return result;
  }

  status(ticketId: string): HelpTicket {
    const state = this.loadAndAdvance();
    const result = this.present(state, ticketId);
    this.save(state);
    return result;
  }

  begin(ticketId: string): HelpTicket {
    const state = this.loadAndAdvance();
    const ticket = state.tickets.find(({ id }) => id === ticketId);
    if (ticket == null) throw new LocalAdmissionError("expired");
    if (ticket.status !== "admitted") throw new LocalAdmissionError("not-admitted");
    ticket.status = "processing";
    ticket.leaseUntil = this.now() + this.config.processingSeconds * 1000;
    const result = this.present(state, ticketId);
    this.save(state);
    return result;
  }

  cancel(ticketId: string): HelpTicket {
    const state = this.loadAndAdvance();
    const ticket = state.tickets.find(({ id }) => id === ticketId);
    if (ticket == null) throw new LocalAdmissionError("expired");
    if (ticket.status === "waiting" || ticket.status === "admitted" || ticket.status === "processing") {
      state.usedUnits = Math.max(0, state.usedUnits - ticket.cost);
      ticket.status = "cancelled";
      delete ticket.leaseUntil;
    }
    this.advance(state);
    const result = this.present(state, ticketId);
    this.save(state);
    return result;
  }

  finish(ticketId: string, success: boolean): HelpTicket {
    const state = this.loadAndAdvance();
    const ticket = state.tickets.find(({ id }) => id === ticketId);
    if (ticket == null) throw new LocalAdmissionError("expired");
    if (ticket.status !== "processing") throw new LocalAdmissionError("expired");
    if (!success) state.usedUnits = Math.max(0, state.usedUnits - ticket.cost);
    ticket.status = success ? "complete" : "expired";
    delete ticket.leaseUntil;
    this.advance(state);
    const result = this.present(state, ticketId);
    this.save(state);
    return result;
  }

  private loadAndAdvance(): AdmissionState {
    const now = this.now();
    const day = utcDay(now);
    let state: AdmissionState = { version: 1, day, usedUnits: 0, tickets: [] };
    try {
      const stored = this.storage.getItem(STATE_KEY);
      if (stored != null) {
        const parsed = JSON.parse(stored) as AdmissionState;
        if (parsed.version === 1 && parsed.day === day && Array.isArray(parsed.tickets)) state = parsed;
      }
    } catch {
      // Corrupt local admission state starts a fresh local day.
    }

    for (const ticket of state.tickets) {
      const waitingExpired = ticket.status === "waiting" && ticket.createdAt + this.config.waitingSeconds * 1000 <= now;
      const leaseExpired = (ticket.status === "admitted" || ticket.status === "processing") &&
        ticket.leaseUntil != null && ticket.leaseUntil <= now;
      if (waitingExpired || leaseExpired) {
        state.usedUnits = Math.max(0, state.usedUnits - ticket.cost);
        ticket.status = "expired";
        delete ticket.leaseUntil;
      }
    }
    this.advance(state);
    return state;
  }

  private advance(state: AdmissionState): void {
    const now = this.now();
    const active = state.tickets.filter(({ status }) => status === "admitted" || status === "processing").length;
    const available = Math.max(0, this.config.concurrency - active);
    const waiting = state.tickets
      .filter(({ status }) => status === "waiting")
      .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
    for (const ticket of waiting.slice(0, available)) {
      ticket.status = "admitted";
      ticket.leaseUntil = now + this.config.reservationSeconds * 1000;
    }
  }

  private present(state: AdmissionState, ticketId: string): HelpTicket {
    const ticket = state.tickets.find(({ id }) => id === ticketId);
    if (ticket == null) throw new LocalAdmissionError("expired");
    const waiting = state.tickets
      .filter(({ status }) => status === "waiting")
      .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
    const rank = waiting.findIndex(({ id }) => id === ticketId);
    const position = rank < 0 ? 0 : rank + 1;
    return {
      id: ticket.id,
      status: ticket.status,
      position,
      estimatedWaitSeconds: position === 0 ? 0 : Math.ceil(position / this.config.concurrency) * this.config.averageSeconds,
      remainingUnits: Math.max(0, this.config.dailyUnits - state.usedUnits),
      resetAt: nextUtcMidnight(this.now()),
      ...(ticket.leaseUntil == null ? {} : { expiresAt: new Date(ticket.leaseUntil).toISOString() }),
    };
  }

  private save(state: AdmissionState): void {
    state.tickets = state.tickets.filter(({ status }) => status !== "complete" && status !== "cancelled" && status !== "expired").slice(-100);
    this.storage.setItem(STATE_KEY, JSON.stringify(state));
  }
}

let queue: LocalAdmissionQueue | null = null;

function browserQueue(): LocalAdmissionQueue {
  queue ??= new LocalAdmissionQueue(window.localStorage, Date.now, localAdmissionConfig());
  return queue;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

async function withFallbackLock<T>(operation: () => T): Promise<T> {
  const owner = crypto.randomUUID();
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const now = Date.now();
    type LockLease = { owner?: string; expiresAt?: number };
    let current: LockLease | null = null;
    try {
      current = JSON.parse(window.localStorage.getItem(FALLBACK_LOCK_KEY) ?? "null") as LockLease | null;
    } catch {
      current = null;
    }
    if (current == null || typeof current.expiresAt !== "number" || current.expiresAt <= now) {
      window.localStorage.setItem(FALLBACK_LOCK_KEY, JSON.stringify({ owner, expiresAt: now + 2_000 }));
      try {
        const acquired = JSON.parse(window.localStorage.getItem(FALLBACK_LOCK_KEY) ?? "null") as { owner?: string } | null;
        if (acquired?.owner === owner) {
          try {
            return operation();
          } finally {
            const latest = JSON.parse(window.localStorage.getItem(FALLBACK_LOCK_KEY) ?? "null") as { owner?: string } | null;
            if (latest?.owner === owner) window.localStorage.removeItem(FALLBACK_LOCK_KEY);
          }
        }
      } catch {
        // Retry if another tab replaced or corrupted the short-lived lease.
      }
    }
    await delay(12 + Math.floor(Math.random() * 12));
  }
  throw new Error("help-admission-lock-unavailable");
}

async function locked<T>(operation: () => T): Promise<T> {
  if (navigator.locks != null) return navigator.locks.request(LOCK_NAME, operation);
  return withFallbackLock(operation);
}

function announceChange(): void {
  if (typeof BroadcastChannel === "undefined") return;
  const channel = new BroadcastChannel(CHANNEL_NAME);
  channel.postMessage({ changed: true });
  channel.close();
}

export async function requestLocalTicket(hasImage: boolean): Promise<HelpTicket> {
  const result = await locked(() => browserQueue().request(hasImage ? 2 : 1));
  announceChange();
  return result;
}

export async function getLocalTicket(ticketId: string): Promise<HelpTicket> {
  return locked(() => browserQueue().status(ticketId));
}

export async function beginLocalTicket(ticketId: string): Promise<HelpTicket> {
  const result = await locked(() => browserQueue().begin(ticketId));
  announceChange();
  return result;
}

export async function cancelLocalTicket(ticketId: string): Promise<HelpTicket> {
  const result = await locked(() => browserQueue().cancel(ticketId));
  announceChange();
  return result;
}

export async function finishLocalTicket(ticketId: string, success: boolean): Promise<HelpTicket> {
  const result = await locked(() => browserQueue().finish(ticketId, success));
  announceChange();
  return result;
}

export function waitForLocalAdmissionChange(timeoutMs: number): Promise<void> {
  if (typeof BroadcastChannel === "undefined") {
    return new Promise((resolve) => window.setTimeout(resolve, timeoutMs));
  }
  return new Promise((resolve) => {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    const timeout = window.setTimeout(finish, timeoutMs);
    function finish() {
      window.clearTimeout(timeout);
      channel.close();
      resolve();
    }
    channel.addEventListener("message", finish, { once: true });
  });
}
