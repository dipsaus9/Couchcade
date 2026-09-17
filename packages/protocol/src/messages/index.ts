import * as z from "zod/mini";
import {
  controllerViewSchema,
  gameIdSchema,
  jsonValueSchema,
  pipProfileSchema,
  playerIdSchema,
  playerInfoSchema,
  roomCodeSchema,
  roomPhaseSchema,
  roomTimeSchema,
  slotSchema,
  type Role,
} from "../shared/index.ts";

// The message catalogue from docs/architecture/platform.md, "Message catalogue".
// Messages are grouped by direction, because `room:welcome` and `controller:state` carry a
// different payload depending on who sends them and who receives them.

// ---- Payloads ------------------------------------------------------------------------------

const gameIdOrNull = z.nullable(gameIdSchema);

/** `room:welcome` to the host. The relay follows it with `player:joined` and `room:snapshot`. */
export const hostWelcomePayloadSchema = z.object({
  role: z.literal("host"),
  code: roomCodeSchema,
  phase: roomPhaseSchema,
  locked: z.boolean(),
});

/** `room:welcome` to a phone. */
export const phoneWelcomePayloadSchema = z.object({
  role: z.enum(["player", "audience"]),
  code: roomCodeSchema,
  phase: roomPhaseSchema,
  you: playerInfoSchema,
});

export const roomHostPayloadSchema = z.object({ connected: z.boolean() });

export const playerJoinedPayloadSchema = z.object({ player: playerInfoSchema });

/** `disconnected` keeps the seat for 2 minutes, `expired` frees it. */
export const playerLeftReasons = ["disconnected", "left", "kicked", "expired"] as const;
export const playerLeftPayloadSchema = z.object({
  id: playerIdSchema,
  reason: z.enum(playerLeftReasons),
});

export const playerReconnectedPayloadSchema = z.object({ id: playerIdSchema });

export const playerPromotedPayloadSchema = z.object({ id: playerIdSchema, slot: slotSchema });

export const playerProfilePayloadSchema = z.object({ profile: pipProfileSchema });

export const emptyPayloadSchema = z.object({});

/** One packed relay sample: milliseconds before the message's own `at`, and its payload. */
export const inputMoreEntrySchema = z.tuple([z.number(), jsonValueSchema]);

export const inputPayloadSchema = z.object({
  type: z.string().check(z.minLength(1)),
  payload: z.optional(jsonValueSchema),
  /** Room time when the player acted. */
  at: roomTimeSchema,
  /**
   * Stream sequence number over the direct link: counts up per phone per link, so the host drops a
   * stream message older than one it already applied (docs/architecture/realtime-link.md, "Link
   * messages"). Absent on the relay path.
   */
  n: z.optional(z.int().check(z.gte(0))),
  /**
   * Event sequence number: counts up per phone per page load and is the same on both paths, so the
   * host applies an event once even if it arrives twice (realtime-link.md, "Link messages").
   */
  e: z.optional(z.int().check(z.gte(0))),
  /**
   * Earlier relay-path samples since the previous message, oldest first, at most 7
   * (realtime-link.md, "Smoothing on the relay path").
   */
  more: z.optional(z.array(inputMoreEntrySchema).check(z.maxLength(7))),
});

export const viewTargetSchema = z.union([
  z.enum(["all", "players", "audience"]),
  z.array(playerIdSchema),
]);

/** `controller:state` from the host: only the entries whose view changed. */
export const controllerStateBatchPayloadSchema = z.object({
  gameId: gameIdOrNull,
  views: z.array(z.object({ to: viewTargetSchema, view: controllerViewSchema })),
});

/** `controller:state` from the relay to one phone: that phone's view only. */
export const controllerStateViewPayloadSchema = z.object({
  gameId: gameIdOrNull,
  view: controllerViewSchema,
});

export const uiActions = [
  "start",
  "pick-game",
  "play-again",
  "back-to-menu",
  "skip-calibration",
  "ready",
] as const;
export const uiActionPayloadSchema = z.object({
  action: z.enum(uiActions),
  value: z.optional(z.string()),
});

export const calibrationTapPayloadSchema = z.object({ at: roomTimeSchema });

export const motionStatuses = ["granted", "denied", "unsupported"] as const;
export const motionStatusPayloadSchema = z.object({ status: z.enum(motionStatuses) });

export const roomKickPayloadSchema = z.object({ id: playerIdSchema });

export const roomLockPayloadSchema = z.object({ locked: z.boolean() });

export const roomPhasePayloadSchema = z.object({ phase: roomPhaseSchema });

export const roomSnapshotPayloadSchema = z.object({
  round: z.int().check(z.gte(0)),
  gameId: gameIdOrNull,
  data: jsonValueSchema,
});

/** `t0` is the sender's local clock, which is not room time and may have a fraction. */
export const clockPingPayloadSchema = z.object({
  id: z.int().check(z.gte(0)),
  t0: z.number(),
});

/** `t1` is room time when the relay received the ping. */
export const clockPongPayloadSchema = z.object({
  id: z.int().check(z.gte(0)),
  t0: z.number(),
  t1: roomTimeSchema,
});

// ---- WebRTC link (docs/architecture/realtime-link.md, "Signalling" and "Channels") --------------

/** A random attempt id the phone picks per offer, so a slow answer to an old attempt never breaks a
 * new one (realtime-link.md, "Messages"). */
const linkAttemptIdSchema = z.int().check(z.gte(0), z.lte(0xff_ff_ff_ff));

/** `[foundation, priority, address, port, type]`. Only UDP host candidates travel: with no STUN
 * server there are no other types to send (realtime-link.md, "Compact descriptions"). */
export const linkCandidateSchema = z.tuple([
  z.string().check(z.minLength(1)),
  z.number(),
  z.string().check(z.minLength(1)),
  z.int().check(z.gte(0), z.lte(65_535)),
  z.literal("host"),
]);
export type LinkCandidate = z.infer<typeof linkCandidateSchema>;

/** The parts of a WebRTC session description that differ per connection, rebuilt against a fixed
 * template on both ends (realtime-link.md, "Compact descriptions"). At most 6 candidates. */
export const linkDescriptionSchema = z.object({
  /** ICE username fragment. */
  u: z.string().check(z.minLength(1)),
  /** ICE password. */
  p: z.string().check(z.minLength(1)),
  /** SHA-256 DTLS certificate fingerprint, base64url. */
  f: z.string().check(z.minLength(1)),
  c: z.array(linkCandidateSchema).check(z.maxLength(6)),
});
export type LinkDescription = z.infer<typeof linkDescriptionSchema>;

export const rtcOfferPayloadSchema = z.object({
  s: linkAttemptIdSchema,
  desc: linkDescriptionSchema,
});

/** `rtc:answer` as the host sends it to the relay: targeted at the player named in `to`. */
export const rtcAnswerFromHostPayloadSchema = z.object({
  to: playerIdSchema,
  s: linkAttemptIdSchema,
  desc: linkDescriptionSchema,
});

/** `rtc:answer` as the relay forwards it to that phone, with `to` removed. */
export const rtcAnswerToPhonePayloadSchema = z.object({
  s: linkAttemptIdSchema,
  desc: linkDescriptionSchema,
});

/** `t0` is the sender's local clock. Sent on `cc-stream`, never through the relay. */
export const linkPingPayloadSchema = z.object({
  id: z.int().check(z.gte(0)),
  t0: z.number(),
});

/** `t1` and `t2` are the host's local receive and send times, `r` its current room clock offset. */
export const linkPongPayloadSchema = z.object({
  id: z.int().check(z.gte(0)),
  t0: z.number(),
  t1: z.number(),
  t2: z.number(),
  r: z.number(),
});

// ---- Envelopes -----------------------------------------------------------------------------

/** A message as a client sends it: `{ t, d }`. Any `from` a client sends is stripped. */
function message<const T extends string, D extends z.ZodMiniObject>(t: T, d: D) {
  return z.object({ t: z.literal(t), d });
}

/** A player message the relay forwards to the host, with `from` set to the player's id. */
function forwarded<const T extends string, D extends z.ZodMiniObject>(t: T, d: D) {
  return z.object({ t: z.literal(t), d, from: playerIdSchema });
}

type Catalogue = Record<string, z.ZodMiniObject>;

/** One schema that validates any message in a direction, picked by `t`. */
function unionOf<C extends Catalogue>(catalogue: C) {
  const options = Object.values(catalogue) as [C[keyof C], ...C[keyof C][]];
  return z.discriminatedUnion("t", options);
}

/** Messages the host sends to the relay. */
export const hostToRelay = {
  "controller:state": message("controller:state", controllerStateBatchPayloadSchema),
  "room:kick": message("room:kick", roomKickPayloadSchema),
  "room:lock": message("room:lock", roomLockPayloadSchema),
  "room:phase": message("room:phase", roomPhasePayloadSchema),
  "room:snapshot": message("room:snapshot", roomSnapshotPayloadSchema),
  "room:end": message("room:end", emptyPayloadSchema),
  "clock:ping": message("clock:ping", clockPingPayloadSchema),
  "rtc:answer": message("rtc:answer", rtcAnswerFromHostPayloadSchema),
};

/** Messages a phone sends to the relay. `senders` says which phone roles may send each. */
export const phoneToRelay = {
  input: message("input", inputPayloadSchema),
  "ui:action": message("ui:action", uiActionPayloadSchema),
  "calibration:tap": message("calibration:tap", calibrationTapPayloadSchema),
  "motion:status": message("motion:status", motionStatusPayloadSchema),
  "player:profile": message("player:profile", playerProfilePayloadSchema),
  "player:leave": message("player:leave", emptyPayloadSchema),
  "clock:ping": message("clock:ping", clockPingPayloadSchema),
  "rtc:offer": message("rtc:offer", rtcOfferPayloadSchema),
};

/** Messages the relay sends to the host. */
export const relayToHost = {
  "room:welcome": message("room:welcome", hostWelcomePayloadSchema),
  "player:joined": message("player:joined", playerJoinedPayloadSchema),
  "player:left": message("player:left", playerLeftPayloadSchema),
  "player:reconnected": message("player:reconnected", playerReconnectedPayloadSchema),
  "player:promoted": message("player:promoted", playerPromotedPayloadSchema),
  "player:profile": forwarded("player:profile", playerProfilePayloadSchema),
  input: forwarded("input", inputPayloadSchema),
  "ui:action": forwarded("ui:action", uiActionPayloadSchema),
  "calibration:tap": forwarded("calibration:tap", calibrationTapPayloadSchema),
  "motion:status": forwarded("motion:status", motionStatusPayloadSchema),
  "room:snapshot": message("room:snapshot", roomSnapshotPayloadSchema),
  "clock:pong": message("clock:pong", clockPongPayloadSchema),
  "rtc:offer": forwarded("rtc:offer", rtcOfferPayloadSchema),
};

/** Messages the relay sends to a phone. */
export const relayToPhone = {
  "room:welcome": message("room:welcome", phoneWelcomePayloadSchema),
  "room:host": message("room:host", roomHostPayloadSchema),
  "controller:state": message("controller:state", controllerStateViewPayloadSchema),
  "player:promoted": message("player:promoted", playerPromotedPayloadSchema),
  "clock:pong": message("clock:pong", clockPongPayloadSchema),
  "rtc:answer": message("rtc:answer", rtcAnswerToPhonePayloadSchema),
};

/**
 * Link frames (realtime-link.md, "Link messages"): JSON text in the same envelope shape, validated
 * against the same 1 KB cap, but carried over the WebRTC data channels and never seen by the room.
 * A link frame has no `from`; the host takes the sender from which link it arrived on.
 */
export const linkPing = message("link:ping", linkPingPayloadSchema);
export const linkPong = message("link:pong", linkPongPayloadSchema);
export type LinkPingMessage = z.infer<typeof linkPing>;
export type LinkPongMessage = z.infer<typeof linkPong>;

export const hostToRelaySchema = unionOf(hostToRelay);
export const phoneToRelaySchema = unionOf(phoneToRelay);
export const relayToHostSchema = unionOf(relayToHost);
export const relayToPhoneSchema = unionOf(relayToPhone);

export type HostToRelayMessage = z.infer<typeof hostToRelaySchema>;
export type PhoneToRelayMessage = z.infer<typeof phoneToRelaySchema>;
export type RelayToHostMessage = z.infer<typeof relayToHostSchema>;
export type RelayToPhoneMessage = z.infer<typeof relayToPhoneSchema>;

/** Any platform message, in any direction. */
export type Envelope =
  | HostToRelayMessage
  | PhoneToRelayMessage
  | RelayToHostMessage
  | RelayToPhoneMessage;
export type MessageType = Envelope["t"];
/** The payload of a message type. For `room:welcome` and `controller:state` this covers both directions. */
export type PayloadOf<T extends MessageType> = Extract<Envelope, { t: T }>["d"];

type ClientMessageType = HostToRelayMessage["t"] | PhoneToRelayMessage["t"];

/** Which roles may send each type to the relay. The relay drops anything else. */
export const senders = {
  "controller:state": ["host"],
  "room:kick": ["host"],
  "room:lock": ["host"],
  "room:phase": ["host"],
  "room:snapshot": ["host"],
  "room:end": ["host"],
  "clock:ping": ["host", "player", "audience"],
  input: ["player"],
  "ui:action": ["player"],
  "calibration:tap": ["player"],
  "motion:status": ["player"],
  "player:profile": ["player", "audience"],
  "player:leave": ["player", "audience"],
  "rtc:answer": ["host"],
  // Only a seated player's offer starts a link (realtime-link.md, "Only seated players get a link").
  "rtc:offer": ["player"],
} as const satisfies Record<ClientMessageType, readonly Role[]>;

/** True when a socket with this role may send this message type to the relay. */
export function canSend(role: Role, type: string): boolean {
  if (!Object.hasOwn(senders, type)) return false;
  const allowed: readonly Role[] = senders[type as ClientMessageType];
  return allowed.includes(role);
}
