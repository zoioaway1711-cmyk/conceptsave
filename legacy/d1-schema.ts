import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const customerProfiles = sqliteTable("customer_profiles", {
  id: text("id").primaryKey(),
  firstSeen: text("first_seen").notNull(),
  lastActive: text("last_active").notNull(),
  preferredLanguage: text("preferred_language").notNull().default("pt"),
  points: integer("points").notNull().default(0),
  level: integer("level").notNull().default(1),
  levelName: text("level_name").notNull().default("Essencial"),
  benefitsJson: text("benefits_json").notNull().default("[]"),
  consentJson: text("consent_json").notNull().default("{}"),
  serialsJson: text("serials_json").notNull().default("[]"),
  revokedSerialsJson: text("revoked_serials_json").notNull().default("[]"),
  verifiedAtJson: text("verified_at_json").notNull().default("{}"),
  rankOverride: integer("rank_override").notNull().default(0),
  blocked: integer("blocked", { mode: "boolean" }).notNull().default(false),
});

export const verificationEvents = sqliteTable("verification_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  profileId: text("profile_id").notNull(),
  serial: text("serial").notNull(),
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
  profileDateIdx: uniqueIndex("idx_verification_profile_serial_time").on(table.profileId, table.serial, table.activatedAt),
}));

export const productSerials = sqliteTable("product_serials", {
  serial: text("serial").primaryKey(),
  name: text("name").notNull(),
  maker: text("maker").notNull().default(""),
  brand: text("brand").notNull().default(""),
  lot: text("lot").notNull().default(""),
  expiry: text("expiry").notNull().default(""),
  status: text("status").notNull().default("authentic"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  updatedBy: text("updated_by").notNull().default("admin"),
});

export const adminAuditEvents = sqliteTable("admin_audit_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  action: text("action").notNull(),
  targetType: text("target_type").notNull().default("system"),
  targetId: text("target_id").notNull().default(""),
  detailsJson: text("details_json").notNull().default("{}"),
  ip: text("ip").notNull().default(""),
  userAgent: text("user_agent").notNull().default(""),
  createdAt: text("created_at").notNull(),
});

export const adminLoginLimits = sqliteTable("admin_login_limits", {
  id: text("id").primaryKey(),
  attempts: integer("attempts").notNull().default(0),
  expiresAt: integer("expires_at").notNull(),
}, (table) => [index("admin_login_limits_expiry_idx").on(table.expiresAt)]);
