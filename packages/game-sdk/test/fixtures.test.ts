// The fixture games pass the contract test kit, exactly as a real game's test/ would call it.
import { testGameContract } from "@couchcade/game-sdk/testing";
import drawRace from "../testing/fixtures/draw-race/src/index.ts";
import pickANumber from "../testing/fixtures/pick-a-number/src/index.ts";

// games/<id>/test/ infers the folder from its path. Fixtures live elsewhere, so they name it.
testGameContract(drawRace, { folder: "draw-race" });
testGameContract(pickANumber, { folder: "pick-a-number" });
