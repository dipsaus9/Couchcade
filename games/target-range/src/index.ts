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
 * Target Range's complete definition (docs/games/target-range.md). Nothing registers it by hand:
 * the host's registry finds this file by its folder (apps/host/src/runtime/games.ts), and phones
 * find `./controller/index.ts` the same way.
 */
export default defineGame({
  id: "target-range",
  title: "Target Range",
  players: { min: 1, max: 8 },
  realtime: true,
  needsMotion: true,
  scene: "range",
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
