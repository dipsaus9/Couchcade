import { defineGameMeta } from "@couchcade/game-sdk/contract";

/**
 * Bandeja's eager metadata (docs/games/bandeja.md, "At a glance").
 * `apps/host/src/runtime/games.ts` globs this file *eagerly*, so it has no other imports: the
 * menu needs it before any room has picked a game. `src/index.ts` (the full game, loaded lazily
 * once a room starts it) imports this file and spreads it into `defineGame`, so the two never
 * drift apart.
 *
 * Registered in CC-23.6: the controller (CC-23.3), TV scene (CC-23.4) and CPU partner (CC-23.8)
 * are built, so the menu shows it and the game can be started.
 */
export default defineGameMeta({
  id: "bandeja",
  title: "Bandeja",
  players: { min: 2, max: 4 },
  realtime: true,
  needsMotion: true,
  scene: "padel",
});
