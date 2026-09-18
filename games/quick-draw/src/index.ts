import { defineGame } from "@couchcade/game-sdk/contract";
import meta from "./meta.ts";
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
 * Quick Draw's complete definition (docs/games/quick-draw.md). Loaded lazily, once a room starts
 * this game (apps/host/src/runtime/games.ts, CC-3.25): the host's eager menu reads only
 * `./meta.ts`. Phones find `./controller/index.ts` the same way. e2e/games/quick-draw.spec.ts
 * plays a match through both.
 */
export default defineGame({
  ...meta,
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
