import type { PhoneState } from "../session/state.ts";

/**
 * True while the phone should show the QuotaScreen: the last join attempt failed because the
 * Cloudflare Workers Free daily request budget is spent (errors/classify.ts), the same way
 * screens/room-full/room-full.ts flags the dedicated Room is full screen.
 */
export function showsQuota(state: PhoneState): boolean {
  return (
    state.status === "join" &&
    state.notice?.kind === "join-failed" &&
    state.notice.failure === "quota"
  );
}
