import { defineGameMeta } from "@couchcade/game-sdk/contract";

/**
 * Bandeja's eager metadata (docs/games/bandeja.md, "At a glance").
 * `apps/host/src/runtime/games.ts` globs this file *eagerly*, so it has no other imports: the
 * menu needs it before any room has picked a game. `src/index.ts` (the full game, loaded lazily
 * once a room starts it) imports this file and spreads it into `defineGame`, so the two never
 * drift apart.
 *
 * `hidden: true` until CC-23.6 registers Bandeja (controller, TV scene and the bot-match E2E
 * test all still need to exist first): the menu never lists it and nothing can start it, exactly
 * as `GameMeta.hidden`'s own doc comment describes. CC-23.6 removes the flag.
 */
export default defineGameMeta({
  id: "bandeja",
  title: "Bandeja",
  players: { min: 2, max: 4 },
  realtime: true,
  needsMotion: true,
  scene: "padel",
  hidden: true,
});
