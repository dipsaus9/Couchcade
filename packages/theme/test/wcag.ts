/**
 * WCAG 2.2 relative luminance and contrast ratio, for the contrast tests.
 * https://www.w3.org/TR/WCAG22/#dfn-contrast-ratio
 */
import type { Hex } from "@couchcade/theme";

/** Normal text needs 4.5:1 for AA; large text and non-text edges need 3:1. */
export const AA_TEXT = 4.5;
export const AA_LARGE = 3;

function channels(hex: Hex): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

export function luminance(hex: Hex): number {
  const [r, g, b] = channels(hex).map((channel) => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: Hex, b: Hex): number {
  const [light, dark] = [luminance(a), luminance(b)].toSorted((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

/** `share` of `top` painted solid over `base`, per sRGB channel, rounded. */
export function mix(top: Hex, base: Hex, share: number): Hex {
  const t = channels(top);
  const b = channels(base);
  return `#${t
    .map((channel, i) => Math.round(channel * share + b[i]! * (1 - share)))
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()}`;
}
