import { defineGame } from "@couchcade/game-sdk/contract";
import {
  init,
  inputSchema,
  onPlayerInput,
  onPlayerLeft,
  onTick,
  outcome,
  restore,
  snapshot,
  view,
} from "./shared/index.ts";

/**
 * Quick Draw's complete definition (docs/games/quick-draw.md). Nothing registers it by hand: the
 * host's registry finds this file by its folder (apps/host/src/runtime/games.ts), and phones find
 * `./controller/index.ts` the same way. e2e/games/quick-draw.spec.ts plays a match through both.
 */
export default defineGame({
  id: "quick-draw",
  title: "Quick Draw",
  players: { min: 1, max: 8 },
  realtime: true,
  needsMotion: false,
  scene: "desert",
  inputSchema,

  init,
  onPlayerInput,
  onTick,
  onPlayerLeft,
  view,
  outcome,
  snapshot,
  restore,

  hostScene: () => import("./host/scene.ts").then((module) => module.default),
});
