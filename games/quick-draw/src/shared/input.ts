import * as z from "zod/mini";
import { maxRounds } from "./constants.ts";

/**
 * The only input: a tap. The round number stops a late tap from counting in the next round.
 * On the wire: `{ "type": "draw", "payload": { "round": 2 }, "at": 1789571234567 }`.
 */
export const inputSchema = z.object({
  type: z.literal("draw"),
  payload: z.object({ round: z.int().check(z.gte(1), z.lte(maxRounds)) }),
});

export type QuickDrawInput = z.infer<typeof inputSchema>;
