import { describe, expect, it } from "vitest";
import { parseCsv } from "./csvParser";

const HEADER = "date,electricity_kwh,water_liters,cost_inr";

describe("CSV parser", () => {
  it("accepts a well-formed file and preserves every value", () => {
    const result = parseCsv(
      [HEADER, "2024-05-01,10.5,120,84", "2024-05-02,11.2,118,89.6"].join("\n"),
      "valid.csv",
    );
    expect(result.ok).toBe(true);
    expect(result.records).toHaveLength(2);
    expect(result.rejected).toHaveLength(0);
    expect(result.records[0]).toEqual({
      date: "2024-05-01",
      electricityKwh: 10.5,
      waterLiters: 120,
      costInr: 84,
    });
  });

  it("fails with a fatal error when a required column is missing", () => {
    const result = parseCsv(
      ["date,usage_kwh,water_liters", "2024-05-01,10.5,120"].join("\n"),
      "missing-column.csv",
    );
    expect(result.ok).toBe(false);
    expect(result.records).toHaveLength(0);
    expect(result.missingColumns).toContain("electricity_kwh");
    expect(result.fatalError).toBeTruthy();
  });

  it("reports an empty file instead of importing nothing silently", () => {
    const result = parseCsv("   \n  \n", "empty.csv");
    expect(result.ok).toBe(false);
    expect(result.fatalError).toMatch(/empty/i);
  });

  it("never zero-fills a missing required value", () => {
    const result = parseCsv(
      [HEADER, ",10,120,5", "2024-05-02,11.2,,5"].join("\n"),
      "missing-values.csv",
    );
    expect(result.records).toHaveLength(0);
    expect(result.rejected).toHaveLength(2);
    expect(result.rejected[0].reason).toMatch(/date/i);
    expect(result.rejected[1].reason).toMatch(/water_liters/i);
  });

  it("rejects negative consumption values", () => {
    const result = parseCsv([HEADER, "2024-05-01,-4,120,5"].join("\n"), "negative.csv");
    expect(result.records).toHaveLength(0);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].reason).toMatch(/negative/i);
  });

  it("rejects a non-numeric consumption value", () => {
    const result = parseCsv([HEADER, "2024-05-01,abc,120,5"].join("\n"), "garbage.csv");
    expect(result.records).toHaveLength(0);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].reason).toMatch(/not a valid number/i);
  });

  it("keeps the first occurrence of a duplicate date and reports the later one", () => {
    const result = parseCsv(
      [HEADER, "2024-05-01,10,100,5", "2024-05-01,99,999,5"].join("\n"),
      "duplicate.csv",
    );
    expect(result.records).toHaveLength(1);
    expect(result.records[0].electricityKwh).toBe(10);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].reason).toMatch(/duplicate/i);
  });

  it("skips fully blank rows and counts them separately from rejections", () => {
    const result = parseCsv([HEADER, "2024-05-01,10,100,5", ",,,"].join("\n"), "blank.csv");
    expect(result.records).toHaveLength(1);
    expect(result.rejected).toHaveLength(0);
    expect(result.emptyRows).toBe(1);
  });

  it("detects a semicolon delimiter and tolerates currency formatting", () => {
    const result = parseCsv(
      ["date;electricity_kwh;water_liters;cost_inr", "2024-05-01;10;100;₹1,234.50"].join("\n"),
      "semicolon.csv",
    );
    expect(result.ok).toBe(true);
    expect(result.delimiter).toBe(";");
    expect(result.records).toHaveLength(1);
    expect(result.records[0].costInr).toBe(1234.5);
  });

  it("imports without the optional cost column and warns about the derived cost", () => {
    const result = parseCsv(
      ["date,electricity_kwh,water_liters", "2024-05-01,10,100"].join("\n"),
      "no-cost.csv",
    );
    expect(result.ok).toBe(true);
    expect(result.hasCostColumn).toBe(false);
    expect(result.records[0].costInr).toBe(0);
    expect(result.warnings.map((w) => w.code)).toContain("no_cost_column");
  });
});
