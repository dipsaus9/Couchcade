import { defineGameMeta } from "@couchcade/game-sdk/contract";

/**
 * Target Range's eager metadata (docs/games/target-range.md). `apps/host/src/runtime/games.ts`
 * globs this file *eagerly*, so it has no other imports: the menu needs it before any room has
 * picked a game. `src/index.ts` (the full game, loaded lazily once a room starts it) imports this
 * file and spreads it into `defineGame`, so the two never drift apart.
 */
export default defineGameMeta({
  id: "target-range",
  title: "Target Range",
  players: { min: 1, max: 8 },
  realtime: true,
  needsMotion: true,
  scene: "range",
});
