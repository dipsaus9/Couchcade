import * as z from "zod/mini";
import { maxTurns } from "./constants.ts";

/**
 * Three input types, all through one CC-3.6 input stream (docs/games/strike-night.md, "Input
 * message schema"). `move` and `grip` are continuous values sent with `set`. `bowl` is an event
 * sent with `fire`, so it goes before any waiting `move` or `grip`, and it carries the position
 * itself.
 */
const turn = z.int().check(z.gte(1), z.lte(maxTurns));
/** Where the bowler stands on the approach, −1 (left edge) to 1 (right edge). */
const position = z.number().check(z.gte(-1), z.lte(1));

export const inputSchema = z.discriminatedUnion("type", [
  // Where the bowler stands on the approach, 0.05 steps.
  z.object({ type: z.literal("move"), payload: z.object({ turn, x: position }) }),
  // The grip went down or came up without a bowl. Only moves the Pip on the TV.
  z.object({ type: z.literal("grip"), payload: z.object({ turn, held: z.boolean() }) }),
  // The swing from createSwingDetector or createSwingSwipe, without peakAt, plus the position.
  z.object({
    type: z.literal("bowl"),
    payload: z.object({
      turn,
      x: position,
      speed: z.number().check(z.gte(0), z.lte(1)),
      angle: z.int().check(z.gte(-180), z.lte(180)),
      spin: z.number().check(z.gte(-1), z.lte(1)),
    }),
  }),
]);
export type StrikeNightInput = z.infer<typeof inputSchema>;
export type MoveInput = Extract<StrikeNightInput, { type: "move" }>;
export type GripInput = Extract<StrikeNightInput, { type: "grip" }>;
export type BowlInput = Extract<StrikeNightInput, { type: "bowl" }>;
