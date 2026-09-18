import * as z from "zod/mini";
import { minPower, volleyCount } from "./constants.ts";

/** Yaw and pitch, −1 to 1. */
const unit = z.number().check(z.gte(-1), z.lte(1));
/** The volley a `shoot` or `lower` belongs to, so a late message never counts for the next one. */
const volley = z.int().check(z.gte(1), z.lte(volleyCount));

/**
 * The three inputs from docs/games/target-range.md, "Input message schema", all through one
 * `InputChannel` (CC-11.9). `aim` is one sample streamed with `channel.stream`, `shoot` and
 * `lower` are events sent with `channel.fire`. On the wire:
 * `{ "type": "shoot", "payload": { "volley": 5, "aim": { "yaw": -0.12, "pitch": 0.31 }, "power": 1 }, "at": 1789571234567 }`.
 */
export const inputSchema = z.discriminatedUnion("type", [
  // One aim sample, 3 decimals (createAimSender, CC-3.21), streamed at `streams.aim.hz` (30).
  z.object({
    type: z.literal("aim"),
    payload: z.object({ yaw: unit, pitch: unit }),
  }),
  // The aim the phone had at release, and the draw power.
  z.object({
    type: z.literal("shoot"),
    payload: z.object({
      volley,
      aim: z.object({ yaw: unit, pitch: unit }),
      power: z.number().check(z.gte(minPower), z.lte(1)),
    }),
  }),
  // The draw was let go too early or cancelled: hide the crosshair.
  z.object({ type: z.literal("lower"), payload: z.object({ volley }) }),
]);

export type TargetRangeInput = z.infer<typeof inputSchema>;
export type AimInput = Extract<TargetRangeInput, { type: "aim" }>;
export type ShootInput = Extract<TargetRangeInput, { type: "shoot" }>;
export type LowerInput = Extract<TargetRangeInput, { type: "lower" }>;
