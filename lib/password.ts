/**
 * PBKDF2-SHA256 password hashing for admin_users, using only Web Crypto
 * (available in Workers) — no external dependency. Encoded as
 * `pbkdf2$<iterations>$<saltHex>$<hashHex>` so the iteration count can be
 * raised later without invalidating existing hashes.
 */
const ITERATIONS = 210_000;
const HASH_BITS = 256;

function toHex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string) {
  const bytes = hex.match(/../g) ?? [];
  return Uint8Array.from(bytes, (byte) => parseInt(byte, 16));
}

async function derive(password: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations }, key, HASH_BITS);
  return toHex(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt, ITERATIONS);
  return `pbkdf2$${ITERATIONS}$${toHex(salt.buffer)}$${hash}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const parts = encoded.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iterations = Number(parts[1]);
  if (!Number.isSafeInteger(iterations) || iterations < 1) return false;
  const salt = fromHex(parts[2]);
  const expected = fromHex(parts[3]);
  const candidate = fromHex(await derive(password, salt, iterations));
  if (candidate.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= candidate[i] ^ expected[i];
  return diff === 0;
}
