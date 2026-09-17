import { defineGameMeta } from "@couchcade/game-sdk/contract";

/**
 * __TITLE__'s eager metadata (docs/architecture/platform.md, "The contract").
 * `apps/host/src/runtime/games.ts` globs this file *eagerly*, so it has no other imports: the
 * menu needs it before any room has picked a game. `src/index.ts` (the full game, loaded lazily
 * once a room starts it) imports this file and spreads it into `defineGame`, so the two never
 * drift apart.
 */
export default defineGameMeta({
  id: "__ID__",
  title: "__TITLE__",
  players: { min: 1, max: 8 },
  realtime: false,
  needsMotion: false,
  scene: "desert",
});
