import { describe, expect, it } from "vitest";
import { maskSerial } from "../lib/audit-log";

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
