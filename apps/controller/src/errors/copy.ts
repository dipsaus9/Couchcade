import { nextQuotaResetLabel } from "./quota.ts";

// Referee-voice copy for the two app-wide error screens (docs/HOUSE_STYLE.md, "Voice"): say what
// happened and what to do next, no apologies. Room not found, room full and connection lost keep
// their existing approved copy (join/copy.ts, screens/waiting/copy.ts) — this file only covers the
// two screens this story adds.

export const offlineCopy = {
  title: "You're offline",
  body: "Check your Wi-Fi or mobile data. This picks up where you left off.",
} as const;

export function quotaCopy(now: Date = new Date()): { title: string; body: string } {
  return {
    title: "Free plays used up for today",
    body: `Couchcade resets at ${nextQuotaResetLabel(now)}. Come back then.`,
  };
}
