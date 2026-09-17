import { describe, expect, it } from "vitest";
import { formatBytes, gzipSize, parseSize, rawSize } from "../src/size.ts";

describe("parseSize", () => {
  it.each([
    ["80 KB", 80 * 1024],
    ["1.5 MB", Math.round(1.5 * 1024 * 1024)],
    ["512B", 512],
    ["0 KB", 0],
  ])("parses %s", (input, bytes) => {
    expect(parseSize(input)).toBe(bytes);
  });

  it("rejects an unparseable size", () => {
    expect(() => parseSize("huge")).toThrow(/Cannot parse size/);
  });
});

describe("formatBytes", () => {
  it("picks the largest unit that stays >= 1", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1024)).toBe("1.00 KB");
    expect(formatBytes(80 * 1024)).toBe("80.00 KB");
    expect(formatBytes(1024 * 1024)).toBe("1.00 MB");
  });
});

describe("gzipSize / rawSize", () => {
  it("gzips smaller than the raw size for compressible text", () => {
    const text = "a".repeat(10_000);
    expect(gzipSize(text)).toBeLessThan(rawSize(text));
  });

  it("measures a Uint8Array's raw size in bytes", () => {
    expect(rawSize(new Uint8Array(37))).toBe(37);
  });
});
