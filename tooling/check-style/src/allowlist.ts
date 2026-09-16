/**
 * Documented exceptions to the colours-and-fonts rule (AC1). Everything else under apps/, games/,
 * packages/, tooling/ and e2e/ must get its colours and fonts from `@couchcade/theme`. A path
 * matches at most needs one reason to be here - keep this list small and each entry explained.
 */
export interface AllowlistEntry {
  readonly test: (relPath: string) => boolean;
  readonly reason: string;
}

export const COLOR_AND_FONT_ALLOWLIST: readonly AllowlistEntry[] = [
  {
    test: (path) => path.startsWith("packages/theme/"),
    reason: "packages/theme IS the single source of truth for every colour and font token.",
  },
  {
    test: (path) => path.startsWith("tooling/assets/"),
    reason:
      "The CC0 asset pipeline (recolour, palette distance, PNG decode/encode) works with raw hex " +
      "as pixel data, not CSS - it's the tool that keeps sprites on-palette, so it necessarily " +
      "handles hex literals directly.",
  },
  {
    test: (path) => /(^|\/)test\//.test(path) || /\.(test|spec)\.tsx?$/.test(path),
    reason:
      "Test fixtures and computed-style assertions (e.g. a local hex-to-rgb() helper for " +
      "getComputedStyle comparisons) aren't shipped UI - they never reach a player.",
  },
];

export function isAllowlisted(relPath: string, allowlist: readonly AllowlistEntry[]): boolean {
  return allowlist.some((entry) => entry.test(relPath));
}
