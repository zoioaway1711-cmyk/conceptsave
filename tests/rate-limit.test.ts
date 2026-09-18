import { describe, expect, it } from "vitest";
import { createFakeD1 } from "./helpers/fake-d1";
import { applyMigrations } from "./helpers/apply-migrations";
import { consumeRateLimit, enforceRateLimits } from "../lib/rate-limit";

function freshDb() {
  const db = createFakeD1();
  applyMigrations(db);
  return db;
}

describe("consumeRateLimit", () => {
  it("allows requests under the limit and blocks once it's exceeded", async () => {
    const db = freshDb();
    for (let i = 0; i < 5; i++) {
      const result = await consumeRateLimit(db as never, "test_scope", "1.2.3.4", 5, 60);
      expect(result.allowed).toBe(true);
    }
    const sixth = await consumeRateLimit(db as never, "test_scope", "1.2.3.4", 5, 60);
    expect(sixth.allowed).toBe(false);
    expect(sixth.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("tracks each identifier independently, so one attacker IP can't exhaust another's budget", async () => {
    const db = freshDb();
    for (let i = 0; i < 5; i++) await consumeRateLimit(db as never, "test_scope", "attacker", 5, 60);
    const victim = await consumeRateLimit(db as never, "test_scope", "victim", 5, 60);
    expect(victim.allowed).toBe(true);
  });

  it("tracks each scope independently, so hammering one endpoint doesn't lock another", async () => {
    const db = freshDb();
    for (let i = 0; i < 5; i++) await consumeRateLimit(db as never, "admin_login", "1.2.3.4", 5, 60);
    const otherScope = await consumeRateLimit(db as never, "customer_login", "1.2.3.4", 5, 60);
    expect(otherScope.allowed).toBe(true);
  });
});

describe("enforceRateLimits", () => {
  it("fails closed on whichever window is tightest", async () => {
    const db = freshDb();
    // Burst window of 2/60s is tighter than the sustained 100/hour window.
    for (let i = 0; i < 2; i++) {
      const result = await enforceRateLimits(db as never, "admin_login", "1.2.3.4", [
        { limit: 2, windowSeconds: 60 },
        { limit: 100, windowSeconds: 3600 },
      ]);
      expect(result.allowed).toBe(true);
    }
    const third = await enforceRateLimits(db as never, "admin_login", "1.2.3.4", [
      { limit: 2, windowSeconds: 60 },
      { limit: 100, windowSeconds: 3600 },
    ]);
    expect(third.allowed).toBe(false);
  });
});
