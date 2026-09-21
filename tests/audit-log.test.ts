import { describe, expect, it, vi } from "vitest";

// audit-log.ts now forwards entries to lib/telegram.ts (which reads
// `cloudflare:workers`'s `env` for the bot token) — this file only tests
// the pure maskSerial() helper, but the module-level import still needs
// something to resolve against.
vi.mock("cloudflare:workers", () => ({ env: {} }));

const { maskSerial } = await import("../lib/audit-log");

describe("maskSerial", () => {
  it("masks every digit except the last four, for 5/6/8-digit serials", () => {
    expect(maskSerial("35172")).toBe("*5172");
    expect(maskSerial("471728")).toBe("**1728");
    expect(maskSerial("12345678")).toBe("****5678");
  });

  it("never reveals the full value even for short input", () => {
    expect(maskSerial("12")).toBe("**");
    expect(maskSerial("")).toBe("");
  });
});
