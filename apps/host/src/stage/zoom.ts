import { world } from "@couchcade/theme";

/**
 * The largest whole-number zoom at which the 480×270 world fits the viewport: ×4 at 1080p, ×8 at
 * 4K. Never below 1. Integer zoom keeps every world pixel square and crisp (HOUSE_STYLE "Game worlds").
 */
export function integerZoom(viewportWidth: number, viewportHeight: number): number {
  const fit = Math.min(viewportWidth / world.width, viewportHeight / world.height);
  return Math.max(1, Math.floor(fit));
}
