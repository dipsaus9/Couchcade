import * as z from "zod/mini";
import type { Player } from "@couchcade/game-sdk/contract";
import type { JsonValue } from "@couchcade/protocol";
import { allSlotSpecs, targetPoints } from "./constants.ts";
import type { SlotName } from "./constants.ts";
import { init, slotSpec } from "./state.ts";
import type { BandejaState } from "./state.ts";

const slotNames = allSlotSpecs.map((spec) => spec.slot) as [SlotName, ...SlotName[]];
const slotSchema = z.enum(slotNames);
const points = z.int().check(z.gte(0), z.lte(99));

/**
 * `{ pts, srv, slots }`: the two scores, which side serves next, and each player's slot, about
 * 120 bytes (docs/games/bandeja.md, "Edge cases", "TV refresh or deploy mid-match"). No positions:
 * the point in progress is lost, and `restore` resumes by serving the next point.
 */
const snapshotSchema = z.object({
  pts: z.tuple([points, points]),
  srv: z.enum(["a", "b"]),
  slots: z.record(z.string(), slotSchema),
});

export type BandejaSnapshot = z.infer<typeof snapshotSchema>;

export function snapshot(state: BandejaState): BandejaSnapshot {
  return {
    pts: [state.scores.a, state.scores.b],
    srv: state.serving,
    slots: Object.fromEntries(state.players.map((player) => [player.id, player.slot])),
  };
}

/**
 * Resumes with the saved scores and each returning player back in their saved slot; a player
 * missing from the save (or a new one) falls back to `init`'s own seat-order assignment for their
 * seat. Starts the next point from `pointEnd`, 2,600 ms out, exactly as a real point end would.
 * A snapshot that doesn't parse starts a new match. A finished match restores as `over`.
 */
export function restore(players: readonly Player[], seed: number, data: JsonValue): BandejaState {
  const fresh = init(players, seed);
  const parsed = snapshotSchema.safeParse(data);
  if (!parsed.success) return fresh;
  const saved = parsed.data;

  const claimed = new Set<SlotName>();
  const restoredPlayers = fresh.players.map((player) => {
    const savedSlot = saved.slots[player.id];
    // A duplicate claim in the saved data (never produced by our own `snapshot`) keeps this
    // player at `init`'s own seat-order slot instead of corrupting the assignment.
    if (savedSlot === undefined || claimed.has(savedSlot)) return player;
    claimed.add(savedSlot);
    const spec = slotSpec(savedSlot);
    return { ...player, slot: spec.slot, side: spec.side };
  });

  const [ptsA, ptsB] = saved.pts;
  const point = ptsA + ptsB + 1;
  if (ptsA >= targetPoints || ptsB >= targetPoints) {
    return {
      ...fresh,
      players: restoredPlayers,
      scores: { a: ptsA, b: ptsB },
      phase: "over",
      point,
    };
  }

  return {
    ...fresh,
    players: restoredPlayers,
    scores: { a: ptsA, b: ptsB },
    serving: saved.srv,
    point,
    phase: "pointEnd",
    phaseAtMs: 0,
    lastPoint: null,
  };
}
