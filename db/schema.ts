import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, index, uniqueIndex, check } from "drizzle-orm/sqlite-core";

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
// plaintext serial is NEVER stored — only its HMAC digest (for exact-match
// lookup) plus the non-secret display prefix/suffix for masked display
// (`CURA-••••-••••-••••-3HZQ`). `ownerProfileId` is set on first activation
// (first-claim-wins, mirroring the old serial-as-proof-of-purchase model)
// and is what actually grants entitlement — never the serial's prefix.
export const licenses = sqliteTable("licenses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  materialId: integer("material_id").notNull().references(() => materials.id),
  serialDigest: text("serial_digest").notNull(),
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
  reason: text("reason").notNull().default(""),
  metadataJson: text("metadata_json").notNull().default("{}"),
  createdAt: text("created_at").notNull(),
}, (table) => ({
  createdAtIdx: index("idx_live_events_created_at").on(table.createdAt),
  typeIdx: index("idx_live_events_type").on(table.type),
  severityCheck: check("live_events_severity_check", sql`${table.severity} IN ('info','warning','critical')`),
}));
