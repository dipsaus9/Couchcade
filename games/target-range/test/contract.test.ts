import { testGameContract } from "@couchcade/game-sdk/testing";
import game from "../src/index.ts";
import { aim } from "./helpers.ts";

// The sampler can't build tuples, so the kit gets aim messages to play alongside its own shoot
// and lower samples.
testGameContract(game, {
  inputs: [aim([-67, 0.2, -0.1], [0, 0.25, -0.12]), aim([0, -1, 1]), aim([-10_000, 1, -1])],
});
