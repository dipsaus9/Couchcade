import { testGameContract } from "@couchcade/game-sdk/testing";
import game from "../src/index.ts";

// The single-sample aim payload (CC-11.9) is a plain object of two `unit` numbers, so the kit's
// own sampler derives valid `aim` inputs from inputSchema; no manual tuple examples needed.
testGameContract(game);
