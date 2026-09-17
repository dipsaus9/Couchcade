import { formatBytes } from "./size.ts";

export interface CheckResult {
  name: string;
  measuredBytes: number;
  limitBytes: number;
  pass: boolean;
  /** Set on checks whose budget isn't from README.md's Performance budgets section verbatim. */
  note?: string;
}

/** Renders the pass/fail table plus any budget notes, for the terminal and the CI log. */
export function formatReport(results: readonly CheckResult[]): string {
  const lines: string[] = ["Bundle size budgets", ""];

  const nameWidth = Math.max(...results.map((r) => r.name.length));
  for (const result of results) {
    const mark = result.pass ? "PASS" : "FAIL";
    const measured = formatBytes(result.measuredBytes).padStart(10);
    const limit = formatBytes(result.limitBytes).padStart(10);
    lines.push(`  ${mark}  ${result.name.padEnd(nameWidth)}  ${measured} / ${limit}`);
  }

  const notes = [...new Set(results.filter((r) => r.note).map((r) => `  - ${r.note}`))];
  if (notes.length > 0) lines.push("", "Notes:", ...notes);

  const failed = results.filter((r) => !r.pass);
  lines.push(
    "",
    failed.length === 0
      ? `All ${results.length} budgets passed.`
      : `${failed.length} of ${results.length} budgets failed: ${failed.map((r) => r.name).join(", ")}.`,
  );

  return `${lines.join("\n")}\n`;
}
