import type { PhoneState } from "../../session/state.ts";

/**
 * The room a phone was kicked from, while the phone should show the Kicked screen, else null. The
 * relay closed the socket with 4003 and refuses this player's rejoin token from now on.
 */
export function kickedFrom(state: PhoneState): string | null {
  if (state.status !== "join" || state.notice?.kind !== "ended") return null;
  return state.notice.reason === "kicked" ? state.notice.code : null;
}
