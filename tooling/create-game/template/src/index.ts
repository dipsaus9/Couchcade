import { defineGame } from "@couchcade/game-sdk/contract";
import meta from "./meta.ts";
import { inputSchema } from "./shared/input.ts";
import { init, onPlayerInput, outcome, restore, snapshot, view } from "./shared/rules.ts";

/**
 * __TITLE__'s complete definition (docs/architecture/platform.md, "The contract"). Loaded lazily,
 * once a room starts this game (apps/host/src/runtime/games.ts): the host's eager menu reads only
 * `./meta.ts`. Phones find `./controller/index.ts` the same way.
 *
 * Before this game can merge, see the checklist `pnpm create-game` printed: write the spec, pick
 * a reviewed scene palette, and add the bot-match E2E test.
 */
export default defineGame({
  ...meta,
  inputSchema,

  init,
  onPlayerInput,
  view,
  outcome,
  snapshot,
  restore,

  hostScene: () => import("./host/scene.ts").then((module) => module.default),
});
