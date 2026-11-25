export type ConversionDispatchStatus =
  | "pending"
  | "tag_callback_completed"
  | "retryable"
  | "max_retries_exceeded";

export interface ConversionDispatchState {
  status: ConversionDispatchStatus;
  attempts: number;
  lastAttemptTs: number;
}

export interface DispatchStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const MAX_DISPATCH_ATTEMPTS = 3;
export const DISPATCH_TIMEOUT_MS = 2000;
export const GRACE_BUFFER_MS = 1000;
export const IN_FLIGHT_WINDOW_MS = DISPATCH_TIMEOUT_MS + GRACE_BUFFER_MS; // 3000ms

const VALID_STATUSES = new Set<ConversionDispatchStatus>([
  "pending",
  "tag_callback_completed",
  "retryable",
  "max_retries_exceeded",
]);

function exhaustedState(now: number): ConversionDispatchState {
  return {
    status: "max_retries_exceeded",
    attempts: MAX_DISPATCH_ATTEMPTS,
    lastAttemptTs: now,
  };
}

export function computeRetryBackoffMs(attemptNumber: number): number {
  const safeAttempt = Number.isFinite(attemptNumber) && attemptNumber >= 1 ? attemptNumber : 1;
  return Math.min(1000 * Math.pow(2, safeAttempt - 1), 4000);
}

/**
 * Parses persisted conversion dispatch state with strict structural and bounds validation.
 * Malformed or out-of-range states fail closed to `max_retries_exceeded` to prevent unbounded retries.
 */
export function parseConversionDispatchState(
  raw: string | null,
  now = Date.now(),
): ConversionDispatchState | null {
  if (raw === null || raw === "") return null;

  if (raw === "dispatched" || raw === "done" || raw === "tag_callback_completed") {
    return {
      status: "tag_callback_completed",
      attempts: 1,
      lastAttemptTs: now,
    };
  }

  if (raw === "retryable") {
    return {
      status: "retryable",
      attempts: 1,
      lastAttemptTs: now,
    };
  }

  if (raw.startsWith("queued:")) {
    const timestamp = Number(raw.slice(7));
    return {
      status: "pending",
      attempts: 1,
      lastAttemptTs: Number.isFinite(timestamp) ? timestamp : now,
    };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<ConversionDispatchState>;
    const valid =
      parsed !== null &&
      typeof parsed === "object" &&
      typeof parsed.attempts === "number" &&
      Number.isInteger(parsed.attempts) &&
      parsed.attempts >= 0 &&
      parsed.attempts <= MAX_DISPATCH_ATTEMPTS &&
      typeof parsed.lastAttemptTs === "number" &&
      Number.isFinite(parsed.lastAttemptTs) &&
      parsed.lastAttemptTs >= 0 &&
      typeof parsed.status === "string" &&
      VALID_STATUSES.has(parsed.status as ConversionDispatchStatus);

    if (!valid) return exhaustedState(now);

    return parsed as ConversionDispatchState;
  } catch {
    return exhaustedState(now);
  }
}

/**
 * Reads conversion dispatch state with in-memory map precedence over storage so that a stale
 * storage record (after a failed `setItem`) can never overwrite a newer in-memory attempt count.
 * Scope note: in-memory guarantees apply within the active JavaScript page lifecycle; cross-reload
 * caps require browser storage (`sessionStorage`) or server-side attempt tracking.
 */
export function readConversionDispatchState(
  key: string,
  memory: Map<string, ConversionDispatchState>,
  storage: DispatchStorage | null | undefined,
  now = Date.now(),
): ConversionDispatchState | null {
  const currentMemory = memory.get(key);
  if (currentMemory) {
    return currentMemory;
  }

  if (!storage) return null;

  try {
    const raw = storage.getItem(key);
    const parsed = parseConversionDispatchState(raw, now);
    if (parsed) {
      memory.set(key, parsed);
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeConversionDispatchState(
  key: string,
  state: ConversionDispatchState,
  memory: Map<string, ConversionDispatchState>,
  storage: DispatchStorage | null | undefined,
): void {
  memory.set(key, state);
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify(state));
  } catch {}
}
