import { explainError } from "@/lib/meta-errors";
import { MetaError } from "@/lib/whatsapp";

/** `soft` means a rule held the send and the user can confirm to send anyway. */
export type SendResult = { ok: boolean; message: string; soft?: boolean };

export function explainSendError(e: unknown) {
  const code = e instanceof MetaError ? (e.code ?? null) : null;
  return { code, error: explainError(code, e instanceof Error ? e.message : "Something went wrong") };
}
