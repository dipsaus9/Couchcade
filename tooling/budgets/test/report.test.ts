import { describe, expect, it } from "vitest";
import { formatReport } from "../src/report.ts";

describe("formatReport", () => {
  it("marks every passing check and prints a summary line", () => {
    const report = formatReport([
      { name: "Controller initial JS", measuredBytes: 50_000, limitBytes: 80 * 1024, pass: true },
      { name: "Host platform JS", measuredBytes: 400_000, limitBytes: 450 * 1024, pass: true },
    ]);
    expect(report).toContain("PASS  Controller initial JS");
    expect(report).toContain("PASS  Host platform JS");
    expect(report).toContain("All 2 budgets passed.");
    expect(report).not.toContain("FAIL");
  });

  it("marks a failing check and names it in the summary", () => {
    const report = formatReport([
      { name: "Controller initial JS", measuredBytes: 90_000, limitBytes: 80 * 1024, pass: false },
    ]);
    expect(report).toContain("FAIL  Controller initial JS");
    expect(report).toContain("1 of 1 budgets failed: Controller initial JS.");
  });

  it("prints each distinct note once, even when several checks share it", () => {
    const report = formatReport([
      {
        name: "Controller per-game chunk (quick-draw)",
        measuredBytes: 1000,
        limitBytes: 25 * 1024,
        pass: true,
        note: "discovered from build output",
      },
      {
        name: "Controller per-game chunk (strike-night)",
        measuredBytes: 1000,
        limitBytes: 25 * 1024,
        pass: true,
        note: "discovered from build output",
      },
    ]);
    expect(report.match(/discovered from build output/g)).toHaveLength(1);
  });
});
