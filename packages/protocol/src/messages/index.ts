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

export const inputPayloadSchema = z.object({
  type: z.string().check(z.minLength(1)),
  payload: z.optional(jsonValueSchema),
  /** Room time when the player acted. */
  at: roomTimeSchema,
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
};

/** Messages the relay sends to a phone. */
export const relayToPhone = {
  "room:welcome": message("room:welcome", phoneWelcomePayloadSchema),
  "room:host": message("room:host", roomHostPayloadSchema),
  "controller:state": message("controller:state", controllerStateViewPayloadSchema),
  "player:promoted": message("player:promoted", playerPromotedPayloadSchema),
  "clock:pong": message("clock:pong", clockPongPayloadSchema),
};

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
} as const satisfies Record<ClientMessageType, readonly Role[]>;

/** True when a socket with this role may send this message type to the relay. */
export function canSend(role: Role, type: string): boolean {
  if (!Object.hasOwn(senders, type)) return false;
  const allowed: readonly Role[] = senders[type as ClientMessageType];
  return allowed.includes(role);
}
