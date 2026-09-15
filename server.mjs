import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import pg from "pg";

const app = express();
const port = Number(process.env.PORT) || 8080;
const root = path.dirname(fileURLToPath(import.meta.url));
const databaseUrl = process.env.DATABASE_URL || "";
const localDataFile = process.env.LOCAL_DATA_FILE
  ? path.resolve(root, process.env.LOCAL_DATA_FILE)
  : "";
const pool = databaseUrl
  ? new pg.Pool({
      connectionString: databaseUrl,
      ssl: databaseUrl.includes("sslmode=")
        ? undefined
        : { rejectUnauthorized: false },
    })
  : null;
const memoryRecords = [];

app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(express.json({ limit: "32kb" }));

const clean = (value, max = 300) =>
  String(value ?? "")
    .trim()
    .slice(0, max);
const serialPattern = /^(?:\d{5}|\d{6}|\d{8})$/;

async function initializeDatabase() {
  if (!pool) {
    if (localDataFile) {
      try {
        const saved = JSON.parse(await fs.readFile(localDataFile, "utf8"));
        if (Array.isArray(saved)) memoryRecords.push(...saved.slice(0, 500));
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      console.log(`Local audit storage: ${localDataFile}`);
    } else {
      console.warn(
        "DATABASE_URL and LOCAL_DATA_FILE are not configured; audit records are temporary.",
      );
    }
    return;
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS verification_events (
      id UUID PRIMARY KEY,
      activated_at TIMESTAMPTZ NOT NULL,
      ip VARCHAR(64) NOT NULL,
      serial VARCHAR(8) NOT NULL,
      profile_id VARCHAR(64) NOT NULL,
      product VARCHAR(160) NOT NULL DEFAULT '',
      maker VARCHAR(120) NOT NULL DEFAULT '',
      lot VARCHAR(80) NOT NULL DEFAULT '',
      status VARCHAR(20) NOT NULL,
      credited BOOLEAN NOT NULL DEFAULT FALSE,
      language VARCHAR(8) NOT NULL DEFAULT '',
      action VARCHAR(20) NOT NULL DEFAULT 'verification',
      source VARCHAR(20) NOT NULL DEFAULT 'manual',
      user_agent VARCHAR(300) NOT NULL DEFAULT '',
      accept_language VARCHAR(160) NOT NULL DEFAULT '',
      country VARCHAR(8) NOT NULL DEFAULT '',
      request_id VARCHAR(100) NOT NULL DEFAULT '',
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb
    );
    CREATE INDEX IF NOT EXISTS verification_events_date_idx
      ON verification_events (activated_at DESC);
    CREATE INDEX IF NOT EXISTS verification_events_serial_idx
      ON verification_events (serial);
  `);
}

async function saveLocalRecords() {
  if (!localDataFile) return;
  await fs.mkdir(path.dirname(localDataFile), { recursive: true });
  const temporaryFile = `${localDataFile}.tmp`;
  await fs.writeFile(temporaryFile, JSON.stringify(memoryRecords, null, 2));
  await fs.rename(temporaryFile, localDataFile);
}

function normalizeMetadata(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return {
    timezone: clean(value.timezone, 80),
    locale: clean(value.locale, 32),
    languages: Array.isArray(value.languages)
      ? value.languages.slice(0, 5).map((item) => clean(item, 24))
      : [],
    platform: clean(value.platform, 80),
    mobile: typeof value.mobile === "boolean" ? value.mobile : null,
    screen: {
      width: Number(value.screen?.width) || null,
      height: Number(value.screen?.height) || null,
      colorDepth: Number(value.screen?.colorDepth) || null,
      pixelRatio: Number(value.screen?.pixelRatio) || null,
    },
    viewport: {
      width: Number(value.viewport?.width) || null,
      height: Number(value.viewport?.height) || null,
    },
    cookiesEnabled:
      typeof value.cookiesEnabled === "boolean" ? value.cookiesEnabled : null,
    doNotTrack: clean(value.doNotTrack, 16),
    online: typeof value.online === "boolean" ? value.online : null,
    connection:
      value.connection && typeof value.connection === "object"
        ? {
            effectiveType: clean(value.connection.effectiveType, 24),
            downlink: Number(value.connection.downlink) || null,
            rtt: Number(value.connection.rtt) || null,
            saveData: Boolean(value.connection.saveData),
          }
        : null,
    referrer: clean(value.referrer, 500),
    page: clean(value.page, 200),
  };
}

app.post("/.netlify/functions/log-verification", async (req, res) => {
  const input = req.body || {};
  const serial = clean(input.serial, 8);
  if (!serialPattern.test(serial))
    return res.status(400).json({ error: "invalid_serial" });
  const record = {
    id: crypto.randomUUID(),
    activatedAt: new Date().toISOString(),
    ip: clean(req.ip || req.socket.remoteAddress || "unknown", 64),
    serial,
    profileId: clean(input.profileId, 64) || "anonymous",
    product: clean(input.product, 160),
    maker: clean(input.maker, 120),
    lot: clean(input.lot, 80),
    status: ["authentic", "invalid", "not_found"].includes(input.status)
      ? input.status
      : "not_found",
    credited: Boolean(input.credited),
    language: clean(input.language, 8),
    action: ["login", "verification"].includes(input.action)
      ? input.action
      : "verification",
    source: ["manual", "qr-camera", "qr-image", "qr-link"].includes(input.source)
      ? input.source
      : "manual",
    userAgent: clean(req.get("user-agent"), 300),
    acceptLanguage: clean(req.get("accept-language"), 160),
    country: clean(req.get("cf-ipcountry") || req.get("x-country"), 8),
    requestId: clean(req.get("x-request-id"), 100),
    metadata: normalizeMetadata(input.metadata),
  };
  if (pool) {
    await pool.query(
      `INSERT INTO verification_events (
        id, activated_at, ip, serial, profile_id, product, maker, lot, status,
        credited, language, action, source, user_agent, accept_language,
        country, request_id, metadata
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18
      )`,
      [
        record.id,
        record.activatedAt,
        record.ip,
        record.serial,
        record.profileId,
        record.product,
        record.maker,
        record.lot,
        record.status,
        record.credited,
        record.language,
        record.action,
        record.source,
        record.userAgent,
        record.acceptLanguage,
        record.country,
        record.requestId,
        record.metadata,
      ],
    );
  } else {
    memoryRecords.unshift(record);
    memoryRecords.splice(500);
    await saveLocalRecords();
  }
  return res.status(201).json({
    saved: true,
    id: record.id,
    activatedAt: record.activatedAt,
  });
});

const cookieName = "sc_admin_session";
function sign(value) {
  return crypto
    .createHmac("sha256", process.env.SESSION_SECRET || "")
    .update(value)
    .digest("base64url");
}
function validSession(req) {
  const raw = req.get("cookie") || "";
  const value = raw
    .split(";")
    .map((part) => part.trim().split("="))
    .find(([name]) => name === cookieName)?.[1];
  if (!value) return false;
  const [expires, signature] = decodeURIComponent(value).split(".");
  const expected = sign(expires);
  if (
    !expires ||
    !signature ||
    Number(expires) <= Date.now() ||
    signature.length !== expected.length
  )
    return false;
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected),
  );
}
async function listRecords() {
  if (!pool) return { records: memoryRecords };
  const { rows } = await pool.query(
    "SELECT * FROM verification_events ORDER BY activated_at DESC LIMIT 500",
  );
  return {
    records: rows.map((row) => ({
      id: row.id,
      activatedAt: row.activated_at,
      ip: row.ip,
      serial: row.serial,
      profileId: row.profile_id,
      product: row.product,
      maker: row.maker,
      lot: row.lot,
      status: row.status,
      credited: row.credited,
      language: row.language,
      action: row.action,
      source: row.source,
      userAgent: row.user_agent,
      acceptLanguage: row.accept_language,
      country: row.country,
      requestId: row.request_id,
      metadata: row.metadata,
    })),
  };
}

app.all("/.netlify/functions/admin-verifications", async (req, res) => {
  const adminUser = process.env.ADMIN_USER;
  const adminPassword = process.env.ADMIN_PASSWORD;
  const secret = process.env.SESSION_SECRET;
  if (!adminUser || !adminPassword || !secret)
    return res.status(503).json({ error: "admin_environment_not_configured" });
  if (req.method === "POST") {
    if (
      req.body?.user !== adminUser ||
      req.body?.password !== adminPassword
    )
      return res.status(401).json({ error: "invalid_credentials" });
    const expires = String(Date.now() + 8 * 60 * 60 * 1000);
    const token = `${expires}.${sign(expires)}`;
    res.setHeader(
      "Set-Cookie",
      `${cookieName}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800`,
    );
    return res.json(await listRecords());
  }
  if (req.method === "DELETE") {
    res.setHeader(
      "Set-Cookie",
      `${cookieName}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`,
    );
    return res.json({ signedOut: true });
  }
  if (req.method !== "GET")
    return res.status(405).json({ error: "method_not_allowed" });
  if (!validSession(req))
    return res.status(401).json({ error: "unauthorized" });
  return res.json(await listRecords());
});

app.get("/health", (_req, res) =>
  res.json({ ok: true, database: Boolean(pool) }),
);
app.use(
  express.static(path.join(root, "dist"), {
    extensions: ["html"],
    etag: true,
    maxAge: "5m",
  }),
);
app.get("/{*path}", (_req, res) =>
  res.sendFile(path.join(root, "dist", "index.html")),
);

initializeDatabase()
  .then(() => {
    app.listen(port, "0.0.0.0", () =>
      console.log(`VerificaFarma listening on port ${port}`),
    );
  })
  .catch((error) => {
    console.error("Database initialization failed", error);
    process.exit(1);
  });
