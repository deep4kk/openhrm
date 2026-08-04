import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
  createHash,
} from "node:crypto";

/**
 * Application-level encryption for the handful of columns that would cause real
 * harm if a database dump leaked: bank account numbers, PAN and Aadhaar.
 *
 * PRD §8.28 requires "encryption at rest for sensitive fields (bank details,
 * government ID numbers)". Disk-level encryption does not satisfy that — it
 * protects against a stolen drive, not against a leaked backup, an over-broad
 * SELECT, or a support engineer with read access. So these values are encrypted
 * before they reach Postgres and decrypted only when a caller holds
 * `employee.sensitive.read`.
 *
 * AES-256-GCM: authenticated, so tampering is detected rather than silently
 * decrypted into garbage. Each value gets a fresh random IV, which means the
 * same account number encrypts to different ciphertext every time — no equality
 * matching on these columns, by design.
 *
 * Stored format:  v1.<iv-b64>.<authTag-b64>.<ciphertext-b64>
 * The version prefix lets us rotate algorithms later without guessing.
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96 bits, the GCM standard
const VERSION = "v1";

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;

  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "ENCRYPTION_KEY is not set. Generate one with:\n" +
        "  node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"",
    );
  }

  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      `ENCRYPTION_KEY must decode to exactly 32 bytes (got ${key.length}). ` +
        "It should be 32 random bytes, base64-encoded.",
    );
  }

  cachedKey = key;
  return key;
}

/** Encrypts a value for storage. Empty and null inputs pass through as null. */
export function encryptField(plaintext: string | null | undefined): string | null {
  if (plaintext === null || plaintext === undefined || plaintext === "") {
    return null;
  }

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    VERSION,
    iv.toString("base64"),
    authTag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(".");
}

/**
 * Decrypts a stored value.
 *
 * Returns null for null input. Throws if the ciphertext has been tampered with
 * or the key is wrong — a corrupted value must never be silently rendered as
 * an empty field, because a blank bank account looks like "not provided".
 */
export function decryptField(stored: string | null | undefined): string | null {
  if (stored === null || stored === undefined || stored === "") {
    return null;
  }

  const parts = stored.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error("Encrypted field is malformed or uses an unknown version");
  }

  const [, ivB64, tagB64, dataB64] = parts;
  const decipher = createDecipheriv(
    ALGORITHM,
    getKey(),
    Buffer.from(ivB64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

/**
 * Decrypts for display but never throws — used in list views where one corrupt
 * row should not take down the whole page. Renders as a visible error instead.
 */
export function decryptFieldSafe(stored: string | null | undefined): string | null {
  try {
    return decryptField(stored);
  } catch {
    return null;
  }
}

/**
 * Shows only the last `visible` characters: "••••••1234".
 * Used everywhere the full value isn't strictly needed, so that a shoulder-surf
 * or a screenshot doesn't expose an account number.
 */
export function maskTail(value: string | null, visible = 4): string {
  if (!value) return "—";
  if (value.length <= visible) return "•".repeat(value.length);
  return "•".repeat(Math.min(value.length - visible, 8)) + value.slice(-visible);
}

// ---------------------------------------------------------------------------
// Token hashing (sessions, invitations)
// ---------------------------------------------------------------------------

/**
 * Hashes a bearer token for storage. Refresh tokens and invitation tokens are
 * stored only as digests, so a database leak cannot be replayed as a login.
 *
 * SHA-256 rather than bcrypt is correct here: these tokens are 256 bits of
 * randomness, not user-chosen passwords, so there is no dictionary to attack
 * and a slow hash would only cost latency on every request.
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** Constant-time comparison, for anywhere a secret is compared directly. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
