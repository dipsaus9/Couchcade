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
 * Putt Club's complete definition (docs/games/putt-club.md). Loaded lazily, once a room starts
 * this game (apps/host/src/runtime/games.ts): the host's eager menu reads only `./meta.ts`.
 * Phones find `./controller/index.ts` the same way. `meta.hidden` keeps it off the menu until
 * CC-13.3 (the phone controller), CC-13.4 (the TV scene) and CC-13.6 (the bot-match E2E test) land.
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
