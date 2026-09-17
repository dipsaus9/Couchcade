import { gzipSync } from "node:zlib";

/** Binary units (1 KB = 1024 B), the convention size-limit and most bundlers use. */
const KB = 1024;
const MB = 1024 * 1024;
const UNITS: Record<string, number> = { B: 1, KB, MB };

/** Parses a budget like `"80 KB"` or `"1.5 MB"` into a byte count. */
export function parseSize(size: string): number {
  const match = /^\s*([\d.]+)\s*(B|KB|MB)\s*$/i.exec(size);
  if (!match) throw new Error(`Cannot parse size "${size}". Use e.g. "80 KB" or "1.5 MB".`);
  const [, amount, unit] = match as unknown as [string, string, string];
  const factor = UNITS[unit.toUpperCase()];
  if (factor === undefined) throw new Error(`Unknown unit in size "${size}".`);
  return Math.round(Number(amount) * factor);
}

/** Formats a byte count back to a human-readable `"NN.NN KB"` string for reports. */
export function formatBytes(bytes: number): string {
  if (bytes < KB) return `${bytes} B`;
  if (bytes < MB) return `${(bytes / KB).toFixed(2)} KB`;
  return `${(bytes / MB).toFixed(2)} MB`;
}

/** Gzip size at max compression, matching how a Cloudflare Worker serves static assets. */
export function gzipSize(input: string | Uint8Array): number {
  const buffer = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return gzipSync(buffer, { level: 9 }).length;
}

/** Raw byte size, for assets (fonts) that are already compressed on disk (WOFF2). */
export function rawSize(input: string | Uint8Array): number {
  return typeof input === "string" ? Buffer.byteLength(input, "utf8") : input.byteLength;
}
