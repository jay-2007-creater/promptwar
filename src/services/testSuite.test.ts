import { describe, expect, it } from "vitest";
import { runTestSuite } from "./testSuite";

/**
 * Guards the in-app regression suite (exposed on the Performance page) so it can never
 * silently drift into a failing state without the CLI run reporting it.
 */
describe("in-app regression suite", () => {
  it("reports every built-in check as passing", () => {
    const report = runTestSuite();
    const failures = report.results
      .filter((result) => result.status === "failed")
      .map((result) => `${result.id}: ${result.detail}`);

    expect(failures).toEqual([]);
    expect(report.failed).toBe(0);
    expect(report.passed).toBe(report.results.length);
    expect(report.results.length).toBeGreaterThanOrEqual(9);
  });

  it("covers the critical journeys and failure paths", () => {
    const ids = runTestSuite().results.map((result) => result.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "valid-csv",
        "invalid-csv",
        "empty-dataset",
        "cost-calculation",
        "emissions-calculation",
        "anomaly-detection",
        "reduction-simulation",
        "invalid-tool-arguments",
        "missing-dataset",
      ]),
    );
  });
});
