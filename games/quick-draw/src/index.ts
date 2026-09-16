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

  // The TV scene arrives with CC-10.4, which swaps this for import("./host/scene.ts").
  hostScene: () => Promise.reject(new Error("The Quick Draw TV scene isn't built yet")),
});
