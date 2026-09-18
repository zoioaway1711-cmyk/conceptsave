import { describe, expect, it } from "vitest";
import { createFakeD1 } from "./helpers/fake-d1";
import { applyMigrations } from "./helpers/apply-migrations";

function freshDb() {
  const db = createFakeD1();
  applyMigrations(db);
  return db;
}

describe("database CHECK constraints (drizzle/0002_*)", () => {
  it("accepts a well-formed product row", () => {
    const db = freshDb();
    expect(() =>
      db.raw.prepare("INSERT INTO products (serial, name, maker, lot, expiry, status) VALUES (?, ?, ?, ?, ?, ?)")
        .run("12345", "Product", "Maker", "LOT1", "12/2027", "authentic"),
    ).not.toThrow();
  });

  it("rejects a product status outside the enum, even via raw SQL bypassing the app layer", () => {
    const db = freshDb();
    expect(() =>
      db.raw.prepare("INSERT INTO products (serial, name, maker, lot, expiry, status) VALUES (?, ?, ?, ?, ?, ?)")
        .run("12345", "Product", "Maker", "LOT1", "12/2027", "totally-fine-trust-me"),
    ).toThrow(/CHECK constraint failed/);
  });

  it("rejects a serial that isn't 5, 6 or 8 digits", () => {
    const db = freshDb();
    expect(() =>
      db.raw.prepare("INSERT INTO products (serial, name, maker, lot, expiry, status) VALUES (?, ?, ?, ?, ?, ?)")
        .run("123", "Product", "Maker", "LOT1", "12/2027", "authentic"),
    ).toThrow(/CHECK constraint failed/);
  });

  it("rejects a verification_events status/action/source outside the enum", () => {
    const db = freshDb();
    const insertOk = () =>
      db.raw.prepare("INSERT INTO verification_events (profile_id, serial, status, action, source, activated_at) VALUES (?, ?, ?, ?, ?, ?)")
        .run("11111", "11111", "authentic", "verification", "manual", "2026-01-01T00:00:00.000Z");
    expect(insertOk).not.toThrow();
    expect(() =>
      db.raw.prepare("INSERT INTO verification_events (profile_id, serial, status, action, source, activated_at) VALUES (?, ?, ?, ?, ?, ?)")
        .run("11111", "11111", "definitely_authentic", "verification", "manual", "2026-01-01T00:00:00.000Z"),
    ).toThrow(/CHECK constraint failed/);
  });

  it("rejects a customer level or rank outside its bounds", () => {
    const db = freshDb();
    expect(() =>
      db.raw.prepare("INSERT INTO customer_profiles (id, first_seen, last_active, level) VALUES (?, ?, ?, ?)")
        .run("11111", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z", 99),
    ).toThrow(/CHECK constraint failed/);
    expect(() =>
      db.raw.prepare("INSERT INTO customer_profiles (id, first_seen, last_active, points) VALUES (?, ?, ?, ?)")
        .run("22222", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z", -50),
    ).toThrow(/CHECK constraint failed/);
  });

  it("rejects an audit_logs result outside success/failure", () => {
    const db = freshDb();
    expect(() =>
      db.raw.prepare("INSERT INTO audit_logs (actor, action, result, created_at) VALUES (?, ?, ?, ?)")
        .run("admin", "ADMIN_LOGIN", "maybe", "2026-01-01T00:00:00.000Z"),
    ).toThrow(/CHECK constraint failed/);
  });
});

describe("materials/licenses/live_events CHECK constraints (drizzle/0003_*)", () => {
  it("rejects a material prefix code shorter than 2 chars or containing lowercase/symbols", () => {
    const db = freshDb();
    const insert = (prefix: string) => db.raw.prepare("INSERT INTO materials (slug, prefix_code, name, created_at) VALUES (?, ?, ?, ?)").run(`slug-${prefix}`, prefix, "Material", "2026-01-01T00:00:00.000Z");
    expect(() => insert("X")).toThrow(/CHECK constraint failed/);
    expect(() => insert("cura")).toThrow(/CHECK constraint failed/);
    expect(() => insert("CU-RA")).toThrow(/CHECK constraint failed/);
    expect(() => insert("CURA")).not.toThrow();
  });

  it("enforces a UNIQUE constraint on materials.slug", () => {
    const db = freshDb();
    db.raw.prepare("INSERT INTO materials (slug, prefix_code, name, created_at) VALUES ('curso-a', 'CURA', 'Curso A', '2026-01-01T00:00:00.000Z')").run();
    expect(() =>
      db.raw.prepare("INSERT INTO materials (slug, prefix_code, name, created_at) VALUES ('curso-a', 'CURB', 'Curso B', '2026-01-01T00:00:00.000Z')").run(),
    ).toThrow(/UNIQUE constraint failed/);
  });

  it("rejects a licenses.status outside active/revoked", () => {
    const db = freshDb();
    db.raw.prepare("INSERT INTO materials (id, slug, prefix_code, name, created_at) VALUES (1, 'm', 'MATX', 'M', '2026-01-01T00:00:00.000Z')").run();
    expect(() =>
      db.raw.prepare("INSERT INTO licenses (material_id, serial_digest, display_prefix, display_suffix, status, created_at) VALUES (1, 'deadbeef', 'MATX', 'AAAA', 'pending', '2026-01-01T00:00:00.000Z')").run(),
    ).toThrow(/CHECK constraint failed/);
  });

  it("enforces a UNIQUE constraint on licenses.serial_digest — the collision-retry safety net", () => {
    const db = freshDb();
    db.raw.prepare("INSERT INTO materials (id, slug, prefix_code, name, created_at) VALUES (1, 'm', 'MATX', 'M', '2026-01-01T00:00:00.000Z')").run();
    db.raw.prepare("INSERT INTO licenses (material_id, serial_digest, display_prefix, display_suffix, status, created_at) VALUES (1, 'samedigest', 'MATX', 'AAAA', 'active', '2026-01-01T00:00:00.000Z')").run();
    expect(() =>
      db.raw.prepare("INSERT INTO licenses (material_id, serial_digest, display_prefix, display_suffix, status, created_at) VALUES (1, 'samedigest', 'MATX', 'BBBB', 'active', '2026-01-01T00:00:00.000Z')").run(),
    ).toThrow(/UNIQUE constraint failed/);
  });

  it("rejects a licenses.material_id that doesn't reference a real material (foreign key enforced)", () => {
    const db = freshDb();
    db.raw.exec("PRAGMA foreign_keys = ON");
    expect(() =>
      db.raw.prepare("INSERT INTO licenses (material_id, serial_digest, display_prefix, display_suffix, status, created_at) VALUES (999, 'x', 'MATX', 'AAAA', 'active', '2026-01-01T00:00:00.000Z')").run(),
    ).toThrow(/FOREIGN KEY constraint failed/);
  });

  it("rejects a live_events severity outside info/warning/critical", () => {
    const db = freshDb();
    expect(() =>
      db.raw.prepare("INSERT INTO live_events (type, severity, created_at) VALUES ('INVALID_SERIAL', 'urgent', '2026-01-01T00:00:00.000Z')").run(),
    ).toThrow(/CHECK constraint failed/);
  });

  it("enforces a UNIQUE constraint on admin_users.username", () => {
    const db = freshDb();
    db.raw.prepare("INSERT INTO admin_users (id, username, password_hash, created_at) VALUES ('a1', 'owner', 'x', '2026-01-01T00:00:00.000Z')").run();
    expect(() =>
      db.raw.prepare("INSERT INTO admin_users (id, username, password_hash, created_at) VALUES ('a2', 'owner', 'y', '2026-01-01T00:00:00.000Z')").run(),
    ).toThrow(/UNIQUE constraint failed/);
  });
});
