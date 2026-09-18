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
 * Strike Night's complete definition (docs/games/strike-night.md). Loaded lazily, once a room
 * starts this game (apps/host/src/runtime/games.ts, CC-3.25): the host's eager menu reads only
 * `./meta.ts`. Phones find `./controller/index.ts` the same way.
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
