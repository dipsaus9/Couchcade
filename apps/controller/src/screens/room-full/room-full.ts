import type { PhoneState } from "../../session/state.ts";

/**
 * True while the phone should show the "Room is full" screen: the join API answered 409
 * `room-full`, or the room closed the socket with 4012 because two joins passed that check at once
 * (docs/architecture/security.md, decision 18).
 */
export function showsRoomFull(state: PhoneState): boolean {
  if (state.status !== "join" || state.notice === null) return false;
  const { notice } = state;
  return notice.kind === "join-failed"
    ? notice.failure === "room-full"
    : notice.reason === "room-full";
}
