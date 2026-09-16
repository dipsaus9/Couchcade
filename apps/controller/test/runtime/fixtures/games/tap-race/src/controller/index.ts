import { defineController } from "@couchcade/game-sdk/contract";

/** A test-only phone entry, laid out like games/<id>/src/controller/index.ts. */
export default defineController({
  id: "tap-race",
  component: () => import("./TapRace.ts").then((module) => module.default),
});
