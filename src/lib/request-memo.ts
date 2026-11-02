import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";

// Reads that one piece of work makes again and again (an incoming WhatsApp message asks for the settings, the
// number to reply from and the shop's details several times while it is answered), made once inside a scope.

const scope = new AsyncLocalStorage<Map<string, Promise<unknown>>>();

/** Runs `fn` with a fresh memo: inside it, each `memo` key is read once. */
export function withMemo<T>(fn: () => Promise<T>): Promise<T> {
  return scope.run(new Map(), fn);
}

/**
 * `load()` once per `withMemo` scope for this key, shared by every caller in it; outside a scope it simply reads.
 * Only for things the scope itself doesn't change. A failed read isn't kept, so the next caller asks again.
 */
export function memo<T>(key: string, load: () => Promise<T>): Promise<T> {
  const m = scope.getStore();
  if (!m) return load();
  const hit = m.get(key) as Promise<T> | undefined;
  if (hit) return hit;
  const p = load();
  m.set(key, p);
  p.catch(() => m.delete(key));
  return p;
}

/** The key of payments.ts replyContext (the customer's last message and the number to answer from). */
export const replyContextKey = (customerId: string) => `reply-context:${customerId}`;

/** Drops a kept read after the scope changed what it read (the next caller reads it fresh). */
export function forget(key: string) {
  scope.getStore()?.delete(key);
}
