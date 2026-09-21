import { defineGameMeta } from "@couchcade/game-sdk/contract";

/**
 * Putt Club's eager metadata (docs/games/putt-club.md, "At a glance").
 * `apps/host/src/runtime/games.ts` globs this file *eagerly*, so it has no other imports: the
 * menu needs it before any room has picked a game. `src/index.ts` (the full game, loaded lazily
 * once a room starts it) imports this file and spreads it into `defineGame`, so the two never
 * drift apart.
 *
 * `hidden: true` (`@couchcade/game-sdk/contract`): CC-13.2 builds only the rules and state. There
 * is no phone controller (CC-13.3), TV scene (CC-13.4) or bot-match E2E test yet, so the menu must
 * not offer it. The story that wires those up (CC-13.6) removes the flag.
 */
export default defineGameMeta({
  id: "putt-club",
  title: "Putt Club",
  players: { min: 1, max: 4 },
  realtime: true,
  needsMotion: true,
  scene: "green",
  hidden: true,
});
