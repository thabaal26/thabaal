import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// Access tokens and API keys are stored encrypted (AES-256-GCM) with DATA_ENC_KEY, a 32-byte key kept only in
// the environment: a copy of the database alone can't be used to send messages as a client.
// Stored form: "enc:v1:" + base64(12-byte IV | 16-byte tag | ciphertext). Values without the prefix are older
// plain-text rows and are read as they are until scripts/encrypt-secrets re-saves them.

const PREFIX = "enc:v1:";
let warned = false;

function key(): Buffer | null {
  const raw = process.env.DATA_ENC_KEY?.trim();
  if (!raw) return null;
  const k = Buffer.from(raw, "base64");
  if (k.length !== 32) throw new Error("DATA_ENC_KEY must be 32 bytes, base64-encoded");
  return k;
}

export const isSealed = (v: string | null | undefined) => typeof v === "string" && v.startsWith(PREFIX);

/** Encrypts a secret for storage. Without DATA_ENC_KEY it stays plain (and says so once in the logs). */
export function seal(value: string | null | undefined): string | null | undefined {
  if (value == null || value === "" || isSealed(value)) return value;
  const k = key();
  if (!k) {
    if (!warned) console.warn("[secret-box] DATA_ENC_KEY is not set; secrets are stored without encryption.");
    warned = true;
    return value;
  }
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", k, iv);
  const body = Buffer.concat([c.update(value, "utf8"), c.final()]);
  return PREFIX + Buffer.concat([iv, c.getAuthTag(), body]).toString("base64");
}

/** The plain secret from a stored value; plain-text values pass through. Null when it can't be decrypted. */
export function unseal(value: string | null | undefined): string | null {
  if (value == null) return null;
  if (!isSealed(value)) return value;
  const k = key();
  if (!k) {
    console.error("[secret-box] An encrypted secret was read but DATA_ENC_KEY is not set.");
    return null;
  }
  try {
    const buf = Buffer.from(value.slice(PREFIX.length), "base64");
    const d = createDecipheriv("aes-256-gcm", k, buf.subarray(0, 12));
    d.setAuthTag(buf.subarray(12, 28));
    return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString("utf8");
  } catch {
    console.error("[secret-box] A stored secret couldn't be decrypted (wrong DATA_ENC_KEY?).");
    return null;
  }
}

/** A short, harmless fingerprint of DATA_ENC_KEY (first 8 hex of its SHA-256), to check two places use the same key. */
export function keyId(): string | null {
  const k = key();
  return k ? createHash("sha256").update(k).digest("hex").slice(0, 8) : null;
}
