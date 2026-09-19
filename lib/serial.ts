import { env } from "cloudflare:workers";

/**
 * License serial format: `<PREFIX>-XXXX-XXXX-XXXX-XXXX`.
 *
 * The prefix (2-10 uppercase letters/digits, taken from the material's
 * `prefixCode`) is for HUMAN identification only — which material a serial
 * belongs to is never decided by reading it back out of the prefix. Real
 * authorization always comes from the `licenses` row found via
 * `serialDigest()`, whose `material_id` foreign key is the only thing that
 * ties a serial to a material.
 *
 * The four secret segments are 4 chars each from a 32-symbol alphabet
 * (Crockford base32, minus padding — excludes I/L/O/U to avoid transcription
 * ambiguity with 1/1/0/V), giving 16 chars x 5 bits = 80 bits of CSPRNG
 * entropy in the part that actually matters for security. That is
 * astronomically larger than the old 5/6/8-digit physical-serial space it
 * replaces (10^5-10^8) and is not brute-forceable even ignoring rate
 * limiting, which still applies as defense in depth.
 */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // 32 symbols
const SEGMENT_COUNT = 4;
const SEGMENT_LENGTH = 4;
export const SERIAL_ENTROPY_BITS = SEGMENT_COUNT * SEGMENT_LENGTH * 5; // 80

const PREFIX_PATTERN = /^[A-Z0-9]{2,10}$/;
const SEGMENT_GROUP = `[${ALPHABET}]{${SEGMENT_LENGTH}}`;

export function isValidPrefixCode(prefix: string) {
  return PREFIX_PATTERN.test(prefix);
}

export function serialPattern(prefix: string) {
  return new RegExp(`^${prefix}(?:-${SEGMENT_GROUP}){${SEGMENT_COUNT}}$`);
}

/**
 * Any well-formed serial, regardless of prefix — used to validate shape
 * before a DB lookup. Deliberately broader than `SEGMENT_GROUP` (which
 * excludes I/L/O/U to keep FRESHLY GENERATED serials unambiguous): this
 * also has to accept serials minted outside `generateSerial()` — e.g. a
 * batch imported from an external serial sheet via `importLicense()` —
 * whose characters aren't guaranteed to avoid that same subset. Rejecting
 * those here would make a validly-issued, physically-printed serial fail
 * every future lookup.
 */
export const ANY_SERIAL_PATTERN = new RegExp(`^[A-Z0-9]{2,10}(?:-[A-Z0-9]{${SEGMENT_LENGTH}}){${SEGMENT_COUNT}}$`);

function randomSegment(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(SEGMENT_LENGTH));
  // 256 % 32 === 0, so `byte % 32` is exactly uniform over the alphabet —
  // no modulo bias to worry about.
  return Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join("");
}

/** Generates one candidate serial for a material. Callers must retry on a UNIQUE constraint violation (see lib/licenses.ts) — this alone never guarantees uniqueness. */
export function generateSerial(prefixCode: string): string {
  const segments = Array.from({ length: SEGMENT_COUNT }, randomSegment);
  return `${prefixCode}-${segments.join("-")}`;
}

/** Uppercases and trims — the canonical form that gets hashed and compared. Does not validate shape; callers should check the pattern first. */
export function normalizeSerial(raw: string): string {
  return raw.trim().toUpperCase();
}

function licenseHmacKey() {
  const secret = (env as unknown as { SESSION_SECRET?: string }).SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET não configurado");
  return crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}

/**
 * Deterministic keyed digest used to look up a license by serial without
 * ever storing the plaintext. Uses SESSION_SECRET with a domain-separating
 * label (matching the existing `admin.`/`customer.` cookie-payload
 * convention) rather than a brand-new secret, so no new env var is
 * required. Deterministic + keyed = safe for exact-match lookup, unlike a
 * per-record-salted password hash (which is the right tool for passwords,
 * wrong tool here since we need `WHERE serial_digest = ?`).
 */
export async function serialDigest(serial: string): Promise<string> {
  const key = await licenseHmacKey();
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`license.${normalizeSerial(serial)}`));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** e.g. "CURA-7K9N-4QPV-8RTW-3HZQ" -> "CURA-••••-••••-••••-3HZQ" — never reconstructs or reveals the middle segments. */
export function maskDisplaySerial(displayPrefix: string, displaySuffix: string): string {
  return `${displayPrefix}-••••-••••-••••-${displaySuffix}`;
}

export function displaySuffixOf(serial: string): string {
  return serial.slice(-SEGMENT_LENGTH);
}

/**
 * AES-256-GCM key for the RECOVERABLE serial copy (`licenses.serial_encrypted`)
 * — separate purpose from `licenseHmacKey()`'s one-way HMAC digest, so it's
 * derived via HKDF with its own domain-separating label from the same
 * SESSION_SECRET (no new env var to provision, matching serialDigest()'s
 * convention above).
 */
async function licenseEncryptionKey() {
  const secret = (env as unknown as { SESSION_SECRET?: string }).SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET não configurado");
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: new TextEncoder().encode("license.serial_encryption") },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/**
 * Encrypts a serial for storage in `licenses.serial_encrypted` — the only
 * place a full serial is recoverable after issuance, deliberately separate
 * from the masked listings and the one-time SHOW-ONCE reveal. Exists so
 * support can pull up the EXACT serial a customer already has (e.g.
 * already printed on their product) instead of only being able to revoke
 * and mint a new one. Every decrypt is gated behind admin auth and
 * audit-logged by the caller (see /api/admin/licenses/[id] "reveal").
 */
export async function encryptSerial(serial: string): Promise<string> {
  const key = await licenseEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(serial)));
  const combined = new Uint8Array(iv.length + ciphertext.length);
  combined.set(iv, 0);
  combined.set(ciphertext, iv.length);
  return btoa(String.fromCharCode(...combined));
}

export async function decryptSerial(encoded: string): Promise<string> {
  const key = await licenseEncryptionKey();
  const combined = Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return new TextDecoder().decode(plaintext);
}
