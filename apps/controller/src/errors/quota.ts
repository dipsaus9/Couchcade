/**
 * The daily free-tier budget resets at 00:00 UTC (docs/architecture/platform.md, "Free-tier budget
 * rules"; docs/design/platform-screens.md, "Errors": "shown in local Dutch summer time (00:00
 * UTC)"). Couchcade is a single-locale, in-person party in the Netherlands, so the reset is always
 * shown in Amsterdam local time, not the viewer's own device time zone.
 */

const resetFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Amsterdam",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** The next 00:00 UTC reset, formatted as "HH:mm" in Amsterdam local time (02:00 in summer). */
export function nextQuotaResetLabel(now: Date = new Date()): string {
  const nextMidnightUtc = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
    0,
    0,
    0,
    0,
  );
  return resetFormatter.format(new Date(nextMidnightUtc));
}
