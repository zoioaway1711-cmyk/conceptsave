import { getStore } from "@netlify/blobs";

const encoder = new TextEncoder();
const json = (statusCode, body, headers = {}) =>
  new Response(JSON.stringify(body), {
    status: statusCode,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      ...headers,
    },
  });
const cookieName = "sc_admin_session";
const b64url = (bytes) =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
async function signature(value) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(Netlify.env.get("SESSION_SECRET") || ""),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return b64url(
    new Uint8Array(
      await crypto.subtle.sign("HMAC", key, encoder.encode(value)),
    ),
  );
}
async function timingSafeStringEqual(a, b) {
  // Hash both sides to a fixed-length digest first so neither a length
  // mismatch nor the byte comparison itself leaks timing information.
  const [da, db] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(String(a ?? ""))),
    crypto.subtle.digest("SHA-256", encoder.encode(String(b ?? ""))),
  ]);
  const va = new Uint8Array(da), vb = new Uint8Array(db);
  let diff = 0;
  for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i];
  return diff === 0;
}
async function validSession(request) {
  const match = request.headers
    .get("cookie")
    ?.match(new RegExp(`(?:^|; )${cookieName}=([^;]+)`));
  if (!match) return false;
  const [expires, sent] = decodeURIComponent(match[1]).split(".");
  if (!expires || !sent || Number(expires) <= Date.now()) return false;
  return timingSafeStringEqual(sent, await signature(expires));
}
const rateLimitBuckets = new Map();
function rateLimited(key, limit, windowMs) {
  const now = Date.now();
  const bucket = rateLimitBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    rateLimitBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  bucket.count += 1;
  return bucket.count > limit;
}
async function listRecords() {
  const store = getStore({
    name: "verification-events",
    consistency: "strong",
  });
  const { blobs } = await store.list({ prefix: "event:" });
  const records = (
    await Promise.all(
      blobs.slice(-500).map((blob) => store.get(blob.key, { type: "json" })),
    )
  )
    .filter(Boolean)
    .sort((a, b) => new Date(b.activatedAt) - new Date(a.activatedAt));
  return { records };
}
export default async (request, context) => {
  const configuredUser = Netlify.env.get("ADMIN_USER"),
    configuredPassword = Netlify.env.get("ADMIN_PASSWORD"),
    secret = Netlify.env.get("SESSION_SECRET");
  if (!configuredUser || !configuredPassword || !secret)
    return json(503, { error: "admin_environment_not_configured" });
  if (request.method === "POST") {
    const ip = request.headers.get("x-nf-client-connection-ip") || context?.ip || "unknown";
    if (rateLimited(`admin-login:${ip}`, 8, 60 * 1000) || rateLimited(`admin-login-sustained:${ip}`, 20, 15 * 60 * 1000))
      return json(429, { error: "rate_limited" });
    let input;
    try {
      input = await request.json();
    } catch {
      return json(400, { error: "invalid_json" });
    }
    const [userOk, passwordOk] = await Promise.all([
      timingSafeStringEqual(input.user, configuredUser),
      timingSafeStringEqual(input.password, configuredPassword),
    ]);
    if (!userOk || !passwordOk)
      return json(401, { error: "invalid_credentials" });
    const expires = String(Date.now() + 8 * 60 * 60 * 1000),
      token = `${expires}.${await signature(expires)}`;
    return json(200, await listRecords(), {
      "set-cookie": `${cookieName}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800`,
    });
  }
  if (request.method === "DELETE")
    return json(
      200,
      { signedOut: true },
      {
        "set-cookie": `${cookieName}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`,
      },
    );
  if (request.method !== "GET")
    return json(405, { error: "method_not_allowed" });
  if (!(await validSession(request)))
    return json(401, { error: "unauthorized" });
  return json(200, await listRecords());
};
