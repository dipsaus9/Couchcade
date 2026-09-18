/**
 * Target Range's phone entry (docs/architecture/platform.md, "How the phone shows a controller").
 * Phones load only this file, never games/target-range/src/index.ts, so the rules, the host scene and
 * Phaser never reach a phone (owner decision, 16 September 2026).
 */
import { defineController } from "@couchcade/game-sdk/contract";

export default defineController({
  id: "target-range",
  component: () => import("./Controller.vue").then((module) => module.default),
  // Aim streams through the InputChannel at 30 samples a second (CC-11.9, docs/architecture/
  // realtime-link.md, "Rates").
  streams: { aim: { hz: 30 } },
});
