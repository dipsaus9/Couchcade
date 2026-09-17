import { defineGame } from "@couchcade/game-sdk/contract";
import { inputSchema } from "./shared/input.ts";
import { init, onPlayerInput, outcome, restore, snapshot, view } from "./shared/rules.ts";

/**
 * __TITLE__'s complete definition (docs/architecture/platform.md, "The contract"). Nothing
 * registers it by hand: the host's registry finds this file by its folder
 * (apps/host/src/runtime/games.ts), and phones find `./controller/index.ts` the same way.
 *
 * Before this game can merge, see the checklist `pnpm create-game` printed: write the spec, pick
 * a reviewed scene palette, and add the bot-match E2E test.
 */
export default defineGame({
  id: "__ID__",
  title: "__TITLE__",
  players: { min: 1, max: 8 },
  realtime: false,
  needsMotion: false,
  scene: "desert",
  inputSchema,

  init,
  onPlayerInput,
  view,
  outcome,
  snapshot,
  restore,

  hostScene: () => import("./host/scene.ts").then((module) => module.default),
});
