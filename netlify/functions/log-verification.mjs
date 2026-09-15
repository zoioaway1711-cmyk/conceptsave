import { getStore } from "@netlify/blobs";

const json = (statusCode, body) =>
  new Response(JSON.stringify(body), {
    status: statusCode,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
const text = (value, max) =>
  String(value || "")
    .trim()
    .slice(0, max);
const safeMetadata = (value) => {
  if (!value || typeof value !== "object") return {};
  return {
    timezone: text(value.timezone, 80),
    locale: text(value.locale, 32),
    languages: Array.isArray(value.languages)
      ? value.languages.slice(0, 5).map((item) => text(item, 24))
      : [],
    platform: text(value.platform, 80),
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
    doNotTrack: text(value.doNotTrack, 16),
    online: typeof value.online === "boolean" ? value.online : null,
    connection:
      value.connection && typeof value.connection === "object"
        ? {
            effectiveType: text(value.connection.effectiveType, 24),
            downlink: Number(value.connection.downlink) || null,
            rtt: Number(value.connection.rtt) || null,
            saveData: Boolean(value.connection.saveData),
          }
        : null,
    referrer: text(value.referrer, 500),
    page: text(value.page, 200),
  };
};

export default async (request, context) => {
  if (request.method !== "POST")
    return json(405, { error: "method_not_allowed" });
  let input;
  try {
    input = await request.json();
  } catch {
    return json(400, { error: "invalid_json" });
  }
  const serial = text(input.serial, 32);
  if (!/^[0-9]{5,8}$/.test(serial))
    return json(400, { error: "invalid_serial" });
  const activatedAt = new Date().toISOString();
  const ip = text(
    request.headers.get("x-nf-client-connection-ip") || context.ip || "unknown",
    64,
  );
  const record = {
    id: crypto.randomUUID(),
    activatedAt,
    ip,
    serial,
    profileId: text(input.profileId, 64) || "anonymous",
    product: text(input.product, 160),
    maker: text(input.maker, 120),
    lot: text(input.lot, 80),
    status: ["authentic", "invalid", "not_found"].includes(input.status)
      ? input.status
      : "not_found",
    credited: Boolean(input.credited),
    language: text(input.language, 8),
    action: ["login", "verification"].includes(input.action)
      ? input.action
      : "verification",
    source: ["manual", "qr-camera", "qr-image", "qr-link"].includes(input.source)
      ? input.source
      : "manual",
    userAgent: text(request.headers.get("user-agent"), 300),
    acceptLanguage: text(request.headers.get("accept-language"), 160),
    country: text(
      request.headers.get("x-country") ||
        request.headers.get("cf-ipcountry") ||
        context.geo?.country?.code ||
        "",
      8,
    ),
    requestId: text(request.headers.get("x-nf-request-id"), 100),
    metadata: safeMetadata(input.metadata),
  };
  const store = getStore({
    name: "verification-events",
    consistency: "strong",
  });
  await store.setJSON(`event:${activatedAt}:${record.id}`, record);
  return json(201, { saved: true, id: record.id, activatedAt });
};
