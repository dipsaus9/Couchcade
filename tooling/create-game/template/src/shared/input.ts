import * as z from "zod/mini";

/**
 * The only input: a tap. Replace this with the game's real inputs (docs/architecture/platform.md,
 * "The contract"). On the wire: `{ "type": "tap", "at": 1789571234567 }`.
 */
export const inputSchema = z.object({ type: z.literal("tap") });

export type __ID_PASCAL__Input = z.infer<typeof inputSchema>;
