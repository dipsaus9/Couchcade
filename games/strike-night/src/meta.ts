import { defineGameMeta } from "@couchcade/game-sdk/contract";

/**
 * Strike Night's eager metadata (docs/games/strike-night.md). `apps/host/src/runtime/games.ts`
 * globs this file *eagerly*, so it has no other imports: the menu needs it before any room has
 * picked a game. `src/index.ts` (the full game, loaded lazily once a room starts it) imports this
 * file and spreads it into `defineGame`, so the two never drift apart.
 *
 * `hidden: true` until CC-12.6 registers it: the controller (CC-12.3) and TV scene (CC-12.4)
 * aren't built yet, so the menu leaves it out and nothing can start it.
 */
export default defineGameMeta({
  id: "strike-night",
  title: "Strike Night",
  players: { min: 1, max: 4 },
  realtime: true,
  needsMotion: true,
  scene: "alley",
  hidden: true,
});
