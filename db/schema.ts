import { sql } from "drizzle-orm";
import { integer, real, sqliteTable, text, index, uniqueIndex, check } from "drizzle-orm/sqlite-core";

export const customerProfiles = sqliteTable("customer_profiles", {
  id: text("id").primaryKey(),
  firstSeen: text("first_seen").notNull(),
  lastActive: text("last_active").notNull(),
  lastSeenAt: text("last_seen_at"),
  preferredLanguage: text("preferred_language").notNull().default("pt"),
  points: integer("points").notNull().default(0),
  level: integer("level").notNull().default(1),
  levelName: text("level_name").notNull().default("Essencial"),
  benefitsJson: text("benefits_json").notNull().default("[]"),
  consentJson: text("consent_json").notNull().default("{}"),
  rankOverride: integer("rank_override").notNull().default(0),
  blocked: integer("blocked", { mode: "boolean" }).notNull().default(false),
  // Set when an admin merges this profile into another (see
  // lib/profile-merge.ts). The row is kept, never deleted — its licenses,
  // notes, change history and live_events are all reassigned to the
  // target — specifically so a customer who still has THIS profile's old
  // session cookie on some device doesn't get permanently locked out:
  // every customer-facing route resolves the cookie's id through this
  // column before using it, so that device transparently lands on the
  // merged (target) account instead of a dead end. There is no "forgot
  // password" flow and serials are single-use, so losing that cookie
  // would otherwise be unrecoverable.
  mergedInto: text("merged_into"),
  mergedAt: text("merged_at"),
}, (table) => ({
  pointsCheck: check("customer_profiles_points_check", sql`${table.points} >= 0`),
  levelCheck: check("customer_profiles_level_check", sql`${table.level} BETWEEN 1 AND 5`),
  rankOverrideCheck: check("customer_profiles_rank_override_check", sql`${table.rankOverride} BETWEEN 0 AND 5`),
  preferredLanguageCheck: check("customer_profiles_preferred_language_check", sql`${table.preferredLanguage} IN ('pt','en','es')`),
  lastSeenIdx: index("idx_customer_profiles_last_seen").on(table.lastSeenAt),
}));

// Historical/legacy: pre-license verification attempts against the old
// digit-serial `products` catalog. No longer written to by new code (see
// `licenses`/`materials` below) — kept read-only so old history isn't lost.
// `licenseId`/`attemptedDigest` are populated by the NEW validation flow
// instead of `serial`, which new rows leave as ''.
export const verificationEvents = sqliteTable("verification_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  profileId: text("profile_id").notNull(),
  serial: text("serial").notNull(),
  licenseId: integer("license_id"),
  attemptedDigest: text("attempted_digest"),
  product: text("product").notNull().default(""),
  maker: text("maker").notNull().default(""),
  lot: text("lot").notNull().default(""),
  status: text("status").notNull(),
  credited: integer("credited", { mode: "boolean" }).notNull().default(false),
  action: text("action").notNull().default("verification"),
  source: text("source").notNull().default("manual"),
  ip: text("ip").notNull().default(""),
  country: text("country").notNull().default(""),
  userAgent: text("user_agent").notNull().default(""),
  metadataJson: text("metadata_json").notNull().default("{}"),
  activatedAt: text("activated_at").notNull(),
}, (table) => ({
  profileDateIdx: index("idx_verification_profile_serial_time").on(table.profileId, table.serial, table.activatedAt),
  serialIdx: index("idx_verification_serial").on(table.serial),
  licenseIdx: index("idx_verification_license").on(table.licenseId),
  statusCheck: check("verification_events_status_check", sql`${table.status} IN ('authentic','invalid','not_found')`),
  actionCheck: check("verification_events_action_check", sql`${table.action} IN ('login','verification')`),
  sourceCheck: check("verification_events_source_check", sql`${table.source} IN ('manual','qr-camera','qr-image','qr-link')`),
}));

// Historical/legacy: the old flat digit-serial catalog. No longer written
// to — superseded by `materials` + `licenses`. Left in place so existing
// rows aren't destroyed, per the explicit decision to do a clean cutover
// rather than a silent data migration.
export const products = sqliteTable("products", {
  serial: text("serial").primaryKey(),
  name: text("name").notNull(),
  maker: text("maker").notNull(),
  lot: text("lot").notNull(),
  expiry: text("expiry").notNull(),
  status: text("status").notNull(),
  brand: text("brand").notNull().default(""),
}, (table) => ({
  statusCheck: check("products_status_check", sql`${table.status} IN ('authentic','invalid')`),
  serialFormatCheck: check("products_serial_format_check", sql`${table.serial} GLOB '[0-9][0-9][0-9][0-9][0-9]' OR ${table.serial} GLOB '[0-9][0-9][0-9][0-9][0-9][0-9]' OR ${table.serial} GLOB '[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]'`),
}));

// Fixed-window counters backing lib/rate-limit.ts. Rows self-expire (a new
// window mints a new key); expired rows are swept opportunistically.
export const rateLimits = sqliteTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(0),
  expiresAt: integer("expires_at").notNull(),
}, (table) => ({
  expiresIdx: index("idx_rate_limits_expires_at").on(table.expiresAt),
}));

// Append-only trail for admin/security-relevant actions. Never store a full
// serial, password, or token here — see lib/audit-log.ts maskSerial().
export const auditLogs = sqliteTable("audit_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  resource: text("resource").notNull().default(""),
  resourceId: text("resource_id").notNull().default(""),
  result: text("result").notNull(),
  ip: text("ip").notNull().default(""),
  metadataJson: text("metadata_json").notNull().default("{}"),
  createdAt: text("created_at").notNull(),
}, (table) => ({
  createdAtIdx: index("idx_audit_logs_created_at").on(table.createdAt),
  actionIdx: index("idx_audit_logs_action").on(table.action),
  resultCheck: check("audit_logs_result_check", sql`${table.result} IN ('success','failure')`),
}));

// A material is a product/content line (e.g. a specific drug+dosage, a
// course, a pack) — the thing a license grants access to/proof of. Never
// itself carries a secret; `prefixCode` is a human-readable label only.
export const materials = sqliteTable("materials", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  slug: text("slug").notNull(),
  prefixCode: text("prefix_code").notNull(),
  name: text("name").notNull(),
  maker: text("maker").notNull().default(""),
  brand: text("brand").notNull().default(""),
  archived: integer("archived", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
}, (table) => ({
  slugUnique: uniqueIndex("idx_materials_slug").on(table.slug),
  // GLOB's `*` is a wildcard over the WHOLE remaining string, not a
  // regex-style repetition of the preceding character class — a naive
  // `[A-Z0-9][A-Z0-9]*` only constrains the first two characters. Negating
  // "contains any character outside A-Z0-9" is the correct GLOB idiom for
  // "every character is uppercase alnum".
  prefixCheck: check("materials_prefix_check", sql`${table.prefixCode} NOT GLOB '*[^A-Z0-9]*' AND length(${table.prefixCode}) BETWEEN 2 AND 10`),
}));

// A license is one issued serial/token instance of a material. The
// serial is never stored in plaintext — only its HMAC digest (for
// exact-match lookup), the non-secret display prefix/suffix for masked
// display (`CURA-••••-••••-••••-3HZQ`), and, separately, an AES-GCM
// ENCRYPTED copy (`serialEncrypted`) that only an authenticated admin can
// decrypt on demand (see lib/serial.ts encryptSerial/decryptSerial and the
// "reveal" action on /api/admin/licenses/[id]) — e.g. to resend a
// customer's exact, already-printed serial when support needs it. Every
// reveal is audit-logged. `serialEncrypted` is nullable because licenses
// issued before this column existed have no encrypted copy to recover.
// `ownerProfileId` is set on first activation (first-claim-wins, mirroring
// the old serial-as-proof-of-purchase model) and is what actually grants
// entitlement — never the serial's prefix.
export const licenses = sqliteTable("licenses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  materialId: integer("material_id").notNull().references(() => materials.id),
  serialDigest: text("serial_digest").notNull(),
  serialEncrypted: text("serial_encrypted"),
  displayPrefix: text("display_prefix").notNull(),
  displaySuffix: text("display_suffix").notNull(),
  lot: text("lot").notNull().default(""),
  status: text("status").notNull().default("active"),
  // No hard FK to customer_profiles: the claim flow sets this column
  // atomically (a single guarded UPDATE) before the corresponding profile
  // row is created in a second statement — a FK would reject that first
  // write. The invariant (every non-null owner_profile_id eventually has a
  // real profile row) is maintained by lib/licenses.ts's claim ordering.
  ownerProfileId: text("owner_profile_id"),
  expiresAt: text("expires_at"),
  createdAt: text("created_at").notNull(),
  activatedAt: text("activated_at"),
  revokedAt: text("revoked_at"),
}, (table) => ({
  digestUnique: uniqueIndex("idx_licenses_digest").on(table.serialDigest),
  materialIdx: index("idx_licenses_material").on(table.materialId),
  ownerIdx: index("idx_licenses_owner").on(table.ownerProfileId),
  statusCheck: check("licenses_status_check", sql`${table.status} IN ('active','revoked')`),
  suffixCheck: check("licenses_display_suffix_check", sql`length(${table.displaySuffix}) = 4`),
}));

// Real admin accounts (replaces the single shared ADMIN_USER/ADMIN_PASSWORD
// pair) so RBAC and audit attribution can name an actual person. The first
// account is auto-provisioned from the legacy env vars on first login if
// this table is still empty — see lib/admin-auth.ts.
export const adminUsers = sqliteTable("admin_users", {
  id: text("id").primaryKey(),
  username: text("username").notNull(),
  passwordHash: text("password_hash").notNull(),
  permissionsJson: text("permissions_json").notNull().default("[]"),
  disabled: integer("disabled", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
  lastLoginAt: text("last_login_at"),
}, (table) => ({
  usernameIdx: uniqueIndex("idx_admin_users_username").on(table.username),
}));

// One row per issued admin login — what makes "view/revoke active
// sessions" possible at all. Before this, vf_admin was a purely stateless
// signed cookie (see lib/admin-auth.ts) with nothing server-side to look
// up or invalidate short of rotating SESSION_SECRET (which logs out
// EVERY admin, not just one). `id` is embedded in the cookie payload
// itself (still HMAC-signed, so a session id alone isn't enough to forge
// one); `revokedAt` is what an explicit "sign out this device" / logout
// actually sets — the row is kept afterward as a record, never deleted.
export const adminSessions = sqliteTable("admin_sessions", {
  id: text("id").primaryKey(),
  adminId: text("admin_id").notNull(),
  createdAt: text("created_at").notNull(),
  lastSeenAt: text("last_seen_at").notNull(),
  expiresAt: text("expires_at").notNull(),
  ip: text("ip").notNull().default(""),
  device: text("device").notNull().default(""),
  revokedAt: text("revoked_at"),
}, (table) => ({
  adminIdx: index("idx_admin_sessions_admin").on(table.adminId, table.id),
}));

// Free-text notes admins leave on a customer profile, visible to every
// admin who can open that profile (see admin.users.inspect) — an
// append-only log (not a single overwritable field) so one admin's note
// never silently erases another's, and so the history of "why we blocked
// this account" etc. survives. `adminUsername` is denormalized at write
// time so a note still shows who wrote it even if that admin account is
// later deleted.
export const adminNotes = sqliteTable("admin_notes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  profileId: text("profile_id").notNull(),
  adminId: text("admin_id").notNull(),
  adminUsername: text("admin_username").notNull(),
  body: text("body").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => ({
  profileIdx: index("idx_admin_notes_profile").on(table.profileId, table.id),
}));

// Field-level diff every time an admin edits a profile's gamification
// fields (points/level/rankOverride/blocked) via POST /api/admin/profiles.
// Separate from `audit_logs`, whose customer_profiles rows key off a
// masked (last-4) resource id — fine for a general "something happened"
// trail, but not safe to look up by for a specific profile's own history
// (two different profile ids can share the same last 4 characters).
// `changesJson` holds only the fields that actually changed, each as
// {from, to} — never a full before/after snapshot of the whole row.
export const adminProfileChanges = sqliteTable("admin_profile_changes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  profileId: text("profile_id").notNull(),
  adminId: text("admin_id").notNull(),
  adminUsername: text("admin_username").notNull(),
  changesJson: text("changes_json").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => ({
  profileIdx: index("idx_admin_profile_changes_profile").on(table.profileId, table.id),
}));

// Unified feed powering /admin/live — deliberately separate from
// `audit_logs` (admin-action trail) and `verification_events` (legacy
// history): this table's shape is purpose-built for the live feed/security
// signals and isn't constrained by either of those tables' existing enums.
// `ip`/`city`/`region` are stored in full; access is redacted at the API
// layer per the viewer's RBAC permissions (admin.security.ip.view), never
// at write time — the DB keeps the full truth, the API decides who sees it.
export const liveEvents = sqliteTable("live_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  type: text("type").notNull(),
  severity: text("severity").notNull().default("info"),
  actorProfileId: text("actor_profile_id"),
  actorAdminId: text("actor_admin_id"),
  materialId: integer("material_id"),
  licenseId: integer("license_id"),
  ip: text("ip").notNull().default(""),
  country: text("country").notNull().default(""),
  region: text("region").notNull().default(""),
  city: text("city").notNull().default(""),
  device: text("device").notNull().default(""),
  // A hash of coarse, stable browser/device signals (screen size, timezone,
  // platform, etc — never canvas/WebGL fingerprinting), recomputed by the
  // client each request rather than stored as a persistent tracking id.
  // Indexed (not stuffed into metadataJson like one-off extras) because its
  // whole purpose is the cross-IP query it enables: "has this same device
  // hit many different accounts/serials" — see lib/rate-limit.ts and the
  // admin Live Intelligence UI.
  deviceFingerprint: text("device_fingerprint").notNull().default(""),
  // Real browser Geolocation API outcome — separate from the IP-based
  // country/region/city above, which never needed a permission prompt.
  // `geoPermission` records what the visitor actually answered (or ''
  // when the client never reported anything, e.g. requests predating this
  // column); coordinates are only ever non-null when it's 'granted'. This
  // is the "aceitou/negou localização" signal for the admin panel.
  geoPermission: text("geo_permission").notNull().default(""),
  geoLatitude: real("geo_latitude"),
  geoLongitude: real("geo_longitude"),
  geoAccuracy: real("geo_accuracy"),
  reason: text("reason").notNull().default(""),
  metadataJson: text("metadata_json").notNull().default("{}"),
  createdAt: text("created_at").notNull(),
}, (table) => ({
  createdAtIdx: index("idx_live_events_created_at").on(table.createdAt),
  typeIdx: index("idx_live_events_type").on(table.type),
  deviceFingerprintIdx: index("idx_live_events_device_fingerprint").on(table.deviceFingerprint),
  severityCheck: check("live_events_severity_check", sql`${table.severity} IN ('info','warning','critical')`),
  geoPermissionCheck: check("live_events_geo_permission_check", sql`${table.geoPermission} IN ('','granted','denied','unavailable','unsupported')`),
}));

// Hard IP blocks for the admin login endpoint — a step beyond the
// rate-limiting in lib/rate-limit.ts, which only ever slows an attacker
// down (the window always rolls over). An IP row here is refused outright
// (see app/api/admin/session/route.ts), checked BEFORE the rate limiter so
// an already-blocked attacker doesn't keep consuming rate_limits writes.
// `expiresAt` NULL means indefinite (only ever set that way by an admin's
// own manual block via the panel/Telegram — the automatic block on
// sustained brute-force always sets a 24h expiry, never permanent, so a
// shared/dynamic IP doesn't stay locked out forever on its own).
export const blockedIps = sqliteTable("blocked_ips", {
  ip: text("ip").primaryKey(),
  reason: text("reason").notNull().default(""),
  blockedBy: text("blocked_by").notNull(),
  blockedAt: text("blocked_at").notNull(),
  expiresAt: text("expires_at"),
});

// ---------------------------------------------------------------------------
// Storefront (/loja)
// ---------------------------------------------------------------------------

// A storefront order. There is no payment gateway yet: an order is created
// as `received` and the team collects payment offline, moving it forward
// from the admin (sc-629f1dc76b/loja). `historyJson` is the append-only
// status timeline shown to the customer — only transitions an admin (or
// the order creation itself) actually made. The CPF is stored AES-GCM
// encrypted with its own HKDF-derived key (lib/loja-orders.ts encryptCpf —
// NOT the license-serial key) and never returned in full to the storefront.
// Stock is reserved only on payment_approved; each item in `itemsJson`
// records `reserved` so a cancellation returns exactly what was taken.
export const lojaOrders = sqliteTable("loja_orders", {
  id: text("id").primaryKey(),
  number: text("number").notNull(),
  status: text("status").notNull(),
  customerName: text("customer_name").notNull(),
  customerEmail: text("customer_email").notNull(),
  customerPhone: text("customer_phone").notNull(),
  customerCpfEncrypted: text("customer_cpf_encrypted").notNull(),
  cpfLast2: text("cpf_last2").notNull(),
  addressJson: text("address_json").notNull(),
  itemsJson: text("items_json").notNull(),
  totalsJson: text("totals_json").notNull(),
  total: real("total").notNull(),
  paymentMethod: text("payment_method").notNull(),
  installments: integer("installments").notNull().default(1),
  trackingCode: text("tracking_code"),
  historyJson: text("history_json").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => ({
  numberUnique: uniqueIndex("idx_loja_orders_number").on(table.number),
  createdIdx: index("idx_loja_orders_created").on(table.createdAt),
  statusCheck: check("loja_orders_status_check", sql`${table.status} IN ('received','payment_approved','preparing','shipped','delivered','cancelled')`),
  paymentCheck: check("loja_orders_payment_check", sql`${table.paymentMethod} IN ('pix','cartao','boleto')`),
}));

// Controlled stock per catalog SKU. A SKU with no row is "not controlled"
// (availability comes from the catalog alone); once a row exists, 0 means
// sold out and orders decrement it atomically.
export const lojaStock = sqliteTable("loja_stock", {
  sku: text("sku").primaryKey(),
  quantity: integer("quantity").notNull(),
  updatedAt: text("updated_at").notNull(),
  updatedBy: text("updated_by").notNull(),
}, (table) => ({
  quantityCheck: check("loja_stock_quantity_check", sql`${table.quantity} >= 0`),
}));

// First-party, consent-gated storefront analytics. Payloads are
// allowlisted server-side (no personal data); `sessionId` is a random
// per-tab id, not tied to any profile, cookie or IP.
export const lojaEvents = sqliteTable("loja_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  paramsJson: text("params_json").notNull(),
  path: text("path").notNull(),
  sessionId: text("session_id").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => ({
  nameCreatedIdx: index("idx_loja_events_name_created").on(table.name, table.createdAt),
  createdIdx: index("idx_loja_events_created").on(table.createdAt),
}));

// E-mail opt-ins from the storefront: launch/restock news (`kind = 'news'`,
// sku '') or "avise-me quando chegar" for one SKU (`kind = 'restock'`).
// Stored only with explicit consent (`consentText` is the exact wording the
// visitor agreed to); removable from the admin on request (LGPD). No
// e-mail is sent automatically — the team exports the list.
export const lojaSubscribers = sqliteTable("loja_subscribers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull(),
  kind: text("kind").notNull(),
  sku: text("sku").notNull().default(""),
  consentText: text("consent_text").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => ({
  uniq: uniqueIndex("idx_loja_subscribers_unique").on(table.email, table.kind, table.sku),
  kindCheck: check("loja_subscribers_kind_check", sql`${table.kind} IN ('news','restock')`),
}));

// Storefront catalog (source of truth since migration 0015; edited in the
// admin → Loja → Catálogo). Structural fields (slug, category, image,
// related lists) are set by the team in code/migrations; the admin edits
// commercial/content fields. JSON columns hold arrays/objects verbatim.
export const lojaProducts = sqliteTable("loja_products", {
  slug: text("slug").primaryKey(),
  sku: text("sku").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  brand: text("brand").notNull(),
  name: text("name").notNull(),
  presentation: text("presentation").notNull(),
  category: text("category").notNull(),
  summary: text("summary").notNull(),
  description: text("description").notNull(),
  price: real("price").notNull(),
  oldPrice: real("old_price"),
  unitsJson: text("units_json"),
  badge: text("badge"),
  rating: real("rating").notNull().default(0),
  reviewCount: integer("review_count").notNull().default(0),
  specsJson: text("specs_json").notNull(),
  freeShipping: integer("free_shipping", { mode: "boolean" }).notNull(),
  available: integer("available", { mode: "boolean" }).notNull(),
  purchasable: integer("purchasable", { mode: "boolean" }).notNull(),
  coldChain: integer("cold_chain", { mode: "boolean" }).notNull(),
  healthNotice: integer("health_notice", { mode: "boolean" }).notNull(),
  imageJson: text("image_json").notNull(),
  keywordsJson: text("keywords_json").notNull(),
  relatedJson: text("related_json").notNull(),
  boughtTogetherJson: text("bought_together_json").notNull(),
  updatedAt: text("updated_at").notNull(),
  updatedBy: text("updated_by").notNull(),
}, (table) => ({
  skuUnique: uniqueIndex("idx_loja_products_sku").on(table.sku),
  categoryCheck: check("loja_products_category_check", sql`${table.category} IN ('frascos','kits','acessorios')`),
  priceCheck: check("loja_products_price_check", sql`${table.price} > 0 AND (${table.oldPrice} IS NULL OR ${table.oldPrice} > ${table.price})`),
}));

// Store settings, one row per key, value stored as JSON.
export const lojaSettings = sqliteTable("loja_settings", {
  key: text("key").primaryKey(),
  valueJson: text("value_json").notNull(),
  updatedAt: text("updated_at").notNull(),
  updatedBy: text("updated_by").notNull(),
});
