import { nextQuotaResetLabel } from "./quota.ts";

// Referee-voice copy for the TV's error screens (docs/HOUSE_STYLE.md, "Voice"). Not in the
// approved errors canvas (docs/design/platform-screens.md, "Not in this canvas": "The TV versions
// of the error screens (CC-9.4)"): this story designs them, following the same panel + badge and
// Chalk-pill patterns as the approved phone screens and the existing `.sound-chip` TV badge in
// App.vue.

export const offlineCopy = {
  title: "This TV is offline",
  body: "Check the Wi-Fi or the ethernet cable. The room keeps its seats while you fix it.",
} as const;

export function quotaCopy(now: Date = new Date()): { title: string; body: string } {
  return {
    title: "Free plays used up for today",
    body: `Couchcade resets at ${nextQuotaResetLabel(now)}. Come back then.`,
  };
}

export const connectionLostCopy = "Reconnecting…";
