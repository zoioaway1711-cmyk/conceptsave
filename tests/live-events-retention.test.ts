import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeD1 } from "./helpers/fake-d1";
import { applyMigrations } from "./helpers/apply-migrations";

vi.mock("cloudflare:workers", () => ({ env: {} }));

const { recordLiveEvent } = await import("../lib/live-events");

let db: ReturnType<typeof createFakeD1>;

beforeEach(() => {
  db = createFakeD1();
  applyMigrations(db);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("recordLiveEvent retention sweep", () => {
  it("purges events older than the retention window on the sampled cleanup pass", async () => {
    const old = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
    const recent = new Date().toISOString();
    db.raw.prepare("INSERT INTO live_events (type, created_at) VALUES ('INVALID_SERIAL', ?)").run(old);
    db.raw.prepare("INSERT INTO live_events (type, created_at) VALUES ('INVALID_SERIAL', ?)").run(recent);

    vi.spyOn(Math, "random").mockReturnValue(0); // force the cleanup branch to run
    await recordLiveEvent(db as never, { type: "ADMIN_LOGIN" });

    const rows = db.raw.prepare("SELECT created_at AS createdAt FROM live_events ORDER BY id").all() as { createdAt: string }[];
    expect(rows.find((row) => row.createdAt === old)).toBeUndefined();
    expect(rows.find((row) => row.createdAt === recent)).toBeDefined();
  });

  it("never runs the cleanup delete when the sample misses (no perf hit on the common path)", async () => {
    const old = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
    db.raw.prepare("INSERT INTO live_events (type, created_at) VALUES ('INVALID_SERIAL', ?)").run(old);

    vi.spyOn(Math, "random").mockReturnValue(0.99); // never hits the 1% cleanup sample
    await recordLiveEvent(db as never, { type: "ADMIN_LOGIN" });

    const rows = db.raw.prepare("SELECT created_at AS createdAt FROM live_events WHERE type='INVALID_SERIAL'").all() as { createdAt: string }[];
    expect(rows).toHaveLength(1);
  });

  it("never throws or blocks the caller even if the DB write fails entirely", async () => {
    const broken = { prepare: () => { throw new Error("boom"); } } as unknown as D1Database;
    await expect(recordLiveEvent(broken, { type: "ADMIN_LOGIN" })).resolves.toBeUndefined();
  });
});
