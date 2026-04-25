import { describe, expect, it } from "vitest";

import { formatCount, formatMoney } from "./formatters";

describe("formatters", () => {
  it("formats USD millions compactly", () => {
    expect(formatMoney(123.456)).toBe("$123.5M");
    expect(formatMoney(1400)).toBe("$1.4B");
  });

  it("formats counts", () => {
    expect(formatCount(116561)).toBe("116,561");
  });
});
