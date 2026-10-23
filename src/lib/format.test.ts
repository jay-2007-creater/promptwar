import { describe, expect, it } from "vitest";
import {
  formatDateShort,
  formatDuration,
  formatInr,
  formatNumber,
  formatPercent,
} from "./format";

describe("formatting helpers", () => {
  it("formats numbers with en-IN grouping and the requested precision", () => {
    expect(formatNumber(1234.5)).toBe("1,235");
    expect(formatNumber(1234.55, 1)).toBe("1,234.6");
    expect(formatNumber(1234.554, 2)).toBe("1,234.55");
  });

  it("prefixes currency values with the rupee sign", () => {
    expect(formatInr(1234)).toBe("₹1,234");
    expect(formatInr(10, 2)).toBe("₹10.00");
  });

  it("returns a placeholder instead of NaN or Infinity", () => {
    expect(formatNumber(Number.NaN)).toBe("—");
    expect(formatNumber(Number.POSITIVE_INFINITY)).toBe("—");
    expect(formatInr(Number.NaN)).toBe("—");
    expect(formatPercent(Number.NaN)).toBe("—");
    expect(formatDuration(Number.NaN)).toBe("—");
  });

  it("signs percentage values", () => {
    expect(formatPercent(12.34)).toBe("+12.3%");
    expect(formatPercent(-5.5)).toContain("5.5%");
    expect(formatPercent(0)).toBe("0.0%");
  });

  it("describes sub-millisecond durations explicitly", () => {
    expect(formatDuration(0.4)).toBe("<1 ms");
    expect(formatDuration(250)).toBe("250 ms");
    expect(formatDuration(2500)).toBe("2.50 s");
  });

  it("formats ISO dates and echoes unparseable input unchanged", () => {
    expect(formatDateShort("2024-05-01")).toMatch(/May/);
    expect(formatDateShort("not-a-date")).toBe("not-a-date");
  });
});
