import type { EndReason, Notice } from "../session/state.ts";
import type { JoinFailure } from "./api.ts";
import type { CodeProblem, NameProblem } from "./form.ts";

// Join screen copy in the friendly-referee voice (docs/HOUSE_STYLE.md, "Voice"): say what
// happened and what to do next, no apologies. Wording follows the approved platform screens canvas.

export const joinFailureCopy: Record<JoinFailure, string> = {
  "not-found": "That code doesn't match a room. Check the TV.",
  "name-not-allowed": "That name's a foul. Pick another one.",
  "room-full": "Room is full. Ask the host to start a new one.",
  "room-locked": "Room is locked. Ask the host to unlock it, then try again.",
  "rate-limited": "Too many tries. Wait a minute, then try again.",
  turnstile: "We couldn't check this phone. Try again.",
  offline: "You're offline. Check your Wi-Fi or mobile data.",
  unavailable: "The room didn't answer. Try again in a moment.",
};

const endReasonCopy: Record<EndReason, (code: string) => string> = {
  kicked: (code) => `Kicked. The host removed you from room ${code}.`,
  "room-closed": (code) => `Room ${code} has closed. Join another one.`,
  flooding: (code) => `Too many taps at once, so you're out of room ${code}. Join again.`,
  replaced: () => "You're playing in another tab now. Carry on there.",
  "seat-expired": (code) => `You were away too long and lost your spot in ${code}. Join again.`,
  "rejoin-refused": (code) => `Your spot in room ${code} is gone. Join again.`,
  "room-full": () => joinFailureCopy["room-full"],
};

export function noticeCopy(notice: Notice): string {
  return notice.kind === "join-failed"
    ? joinFailureCopy[notice.failure]
    : endReasonCopy[notice.reason](notice.code);
}

export const codeHint: Record<CodeProblem | "ok" | "from-url", string> = {
  incomplete: "Type the 4 letters on the TV",
  ok: "Room code ready",
  "from-url": "Filled in from the QR code",
};

export const nameHint: Record<NameProblem | "ok", string> = {
  empty: "1 to 12 letters",
  "too-long": "Names are 12 letters at most",
  character: "Letters, numbers and ' - . _ only",
  "no-letter": "Add a letter or a number",
  blocked: joinFailureCopy["name-not-allowed"],
  ok: "Your name on the TV",
};
