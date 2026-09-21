/**
 * Bandeja's phone entry (docs/architecture/platform.md, "How the phone shows a controller").
 * Phones load only this file, never games/bandeja/src/index.ts, so the rules, the host scene and
 * Phaser never reach a phone (owner decision, 16 September 2026).
 */
import { defineController } from "@couchcade/game-sdk/contract";

export default defineController({
  id: "bandeja",
  component: () => import("./Controller.vue").then((module) => module.default),
});
