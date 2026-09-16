import { defineController } from "@couchcade/game-sdk/contract";

/** The fixture's phone entry. Fixture games have no real controller component. */
export default defineController({
  id: "draw-race",
  component: () => Promise.reject(new Error("Fixture games have no controller component")),
});
