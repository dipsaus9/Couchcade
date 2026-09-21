import * as z from "zod/mini";
import { maxTurns } from "./constants.ts";

/**
 * Three input types, all through one `InputChannel` (docs/games/putt-club.md, "Input message
 * schema"). `aim` and `line` are continuous values sent with `stream`/`set`. `putt` is an event
 * sent with `fire`, so it goes before any waiting value, and it carries the locked line itself
 * rather than trusting the streamed one to have arrived.
 */
const unit = z.number().check(z.gte(-1), z.lte(1));
/** The stroke a `line` or `putt` belongs to, so a late message never counts for the next one. */
const turn = z.int().check(z.gte(1), z.lte(maxTurns));

export const inputSchema = z.discriminatedUnion("type", [
  // One aim sample from createAimDetector or createAimDrag. `pitch` is carried because the
  // platform's sender sends it; a flat green ignores it (owner decision 2).
  z.object({
    type: z.literal("aim"),
    payload: z.object({ yaw: unit, pitch: unit }),
  }),
  // The line was locked by the grip, or let go again without a swing.
  z.object({
    type: z.literal("line"),
    payload: z.object({ turn, locked: z.boolean(), yaw: unit }),
  }),
  // The swing from createSwingDetector or createSwingSwipe, carrying the line it was locked on.
  z.object({
    type: z.literal("putt"),
    payload: z.object({
      turn,
      yaw: unit,
      speed: z.number().check(z.gte(0), z.lte(1)),
      angle: z.int().check(z.gte(-180), z.lte(180)),
    }),
  }),
]);
export type PuttClubInput = z.infer<typeof inputSchema>;
export type AimInput = Extract<PuttClubInput, { type: "aim" }>;
export type LineInput = Extract<PuttClubInput, { type: "line" }>;
export type PuttInput = Extract<PuttClubInput, { type: "putt" }>;
