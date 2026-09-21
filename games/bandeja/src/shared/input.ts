import * as z from "zod/mini";

/**
 * One input type, through one CC-3.6 input channel (docs/games/bandeja.md, "Input message
 * schema"). A swing is a discrete event, sent with `fire` and the swing's peak as
 * `eventTimeStamp`.
 */
const point = z.int().check(z.gte(1), z.lte(99));

export const inputSchema = z.discriminatedUnion("type", [
  // One swing from createSwingDetector or createSwingTap, without spin or peakAt.
  z.object({
    type: z.literal("swing"),
    payload: z.object({
      point,
      speed: z.number().check(z.gte(0), z.lte(1)),
      angle: z.int().check(z.gte(-180), z.lte(180)),
    }),
  }),
]);
export type BandejaInput = z.infer<typeof inputSchema>;
export type SwingInput = Extract<BandejaInput, { type: "swing" }>;
