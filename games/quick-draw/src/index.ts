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

export default defineGame({
  id: "quick-draw",
  title: "Quick Draw",
  players: { min: 2, max: 8 },
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
