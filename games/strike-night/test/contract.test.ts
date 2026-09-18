import { testGameContract } from "@couchcade/game-sdk/testing";
import game from "../src/index.ts";

// docs/games/strike-night.md, "Rules and scoring" rule 11: "No randomness. Nothing in Strike
// Night is random. The seed is unused". `init` stores it (state.ts) but nothing under
// onPlayerInput/onTick ever reads it, so the 3 default seeds simulate byte-for-byte identical
// Planck.js sessions here -- 3x the wall-clock cost of `onPlayerInput and onTick are pure and
// repeatable` (a Planck.js session per seed) for zero extra coverage. That test was timing out
// against the harness's fixed 30 s budget (packages/game-sdk/testing/contract.ts) on CI's slower
// runners; one seed is both correct and enough.
testGameContract(game, { seeds: [1] });
