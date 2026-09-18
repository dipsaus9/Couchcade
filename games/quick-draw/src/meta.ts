import { defineGameMeta } from "@couchcade/game-sdk/contract";

/**
 * Quick Draw's eager metadata (docs/games/quick-draw.md). `apps/host/src/runtime/games.ts` globs
 * this file *eagerly*, so it has no other imports: the menu needs it before any room has picked a
 * game. `src/index.ts` (the full game, loaded lazily once a room starts it) imports this file and
 * spreads it into `defineGame`, so the two never drift apart.
 */
export default defineGameMeta({
  id: "quick-draw",
  title: "Quick Draw",
  players: { min: 1, max: 8 },
  realtime: true,
  needsMotion: false,
  scene: "desert",
});
