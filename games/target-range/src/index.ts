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
 *
 * `hidden` keeps it off the menu while the phone controller (CC-11.3) and the TV scene (CC-11.4)
 * are placeholders. CC-11.6 removes it together with the bot-match E2E test.
 */
export default defineGame({
  id: "target-range",
  title: "Target Range",
  players: { min: 1, max: 8 },
  realtime: true,
  needsMotion: true,
  scene: "range",
  hidden: true,
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
