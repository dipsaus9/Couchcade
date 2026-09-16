import * as z from "zod/mini";

/** Letters used by room codes and player ids: A to Z without I and O. */
export const roomCodeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ";

/** A room code: 4 letters from `roomCodeAlphabet`. */
export const roomCodeSchema = z.string().check(z.regex(/^[A-HJ-NP-Z]{4}$/));
export type RoomCode = z.infer<typeof roomCodeSchema>;

/** A player id: 8 letters from `roomCodeAlphabet`. */
export const playerIdSchema = z.string().check(z.regex(/^[A-HJ-NP-Z]{8}$/));
export type PlayerId = z.infer<typeof playerIdSchema>;

/** A game id: kebab-case, equal to the folder name `games/<id>`. */
export const gameIdSchema = z.string().check(z.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/));
export type GameId = z.infer<typeof gameIdSchema>;

/** Room time: milliseconds since the Unix epoch on the room clock, as an integer. */
export const roomTimeSchema = z.int().check(z.gte(0));

/** Seats in a room. Slot 0 to 7 picks the player's colour and shape. */
export const seatCount = 8;
export const slotSchema = z.int().check(z.gte(0), z.lt(seatCount));

/** Any JSON value: objects, arrays, strings, numbers, booleans and null. */
export const jsonValueSchema = z.json();
export type JsonValue = z.infer<typeof jsonValueSchema>;

/** Who a socket belongs to. Audience phones have no seat. */
export const roles = ["host", "player", "audience"] as const;
export const roleSchema = z.enum(roles);
export type Role = z.infer<typeof roleSchema>;

/**
 * Options per Pip part (HOUSE_STYLE "Pips"). A profile stores the index of each option.
 * CC-6.1 refines the parts and CC-6.2 adds the ranges to `@couchcade/utils`.
 */
export const pipPartCounts = { skin: 6, hair: 8, hairColour: 6 } as const;

const pipPart = (count: number) => z.int().check(z.gte(0), z.lt(count));

export const pipProfileSchema = z.object({
  skin: pipPart(pipPartCounts.skin),
  hair: pipPart(pipPartCounts.hair),
  hairColour: pipPart(pipPartCounts.hairColour),
});
export type PipProfile = z.infer<typeof pipProfileSchema>;

/** A player name after the server normalised it: 1 to 12 characters. */
export const playerNameSchema = z.string().check(z.minLength(1), z.maxLength(12));

export const playerInfoSchema = z.object({
  id: playerIdSchema,
  name: playerNameSchema,
  /** 0 to 7 picks colour and shape; null means audience. */
  slot: z.nullable(slotSchema),
  profile: pipProfileSchema,
  /** Room time. The VIP is the connected player with the lowest `joinedAt`. */
  joinedAt: roomTimeSchema,
  connected: z.boolean(),
});
export type PlayerInfo = z.infer<typeof playerInfoSchema>;

/** One-shot haptic cues a view can ask the phone to play. */
export const cueTokens = ["press", "your-turn", "celebrate", "foul"] as const;
export const cueTokenSchema = z.enum(cueTokens);
export type CueToken = z.infer<typeof cueTokenSchema>;

/** Screen names the platform owns, used when `gameId` is `null`. */
export const platformScreens = [
  "lobby",
  "waiting",
  "menu",
  "vip-choosing",
  "calibration",
  "motion-permission",
  "results",
  "party-standings",
  "audience",
  "next-game",
] as const;
export type PlatformScreen = (typeof platformScreens)[number];

export const controllerViewSchema = z.object({
  /** A platform screen name, or a screen the game defines. */
  screen: z.string().check(z.minLength(1)),
  /** Whatever that screen needs. */
  data: jsonValueSchema,
  cue: z.optional(cueTokenSchema),
});
export type ControllerView = z.infer<typeof controllerViewSchema>;

export const roomPhases = [
  "lobby",
  "menu",
  "calibration",
  "motion-check",
  "playing",
  "results",
  "party",
] as const;
export const roomPhaseSchema = z.enum(roomPhases);
export type RoomPhase = z.infer<typeof roomPhaseSchema>;
