import { testGameContract } from "@couchcade/game-sdk/testing";
import game from "../src/index.ts";

// A shorter simulated session than the 1,800-tick default. `sampleInputs` derives generic swing
// samples straight from `inputSchema`, with no notion of Bandeja's own `payload.point` freshness
// check: every sample's `point` stops matching after the very first point concludes, so every
// later swing this session ever sends is rejected. Both seated players then go "away" (rule 10,
// three unanswered arrivals) and the rest of the session plays out as an uninterrupted auto-vs-
// auto rally, which re-runs `predict`'s 150-step look-ahead (docs/games/bandeja.md, "Look-ahead")
// on every single auto-hit — CI measured this check timing out at the shared 60 s budget under
// real runner contention. None of the properties this check exercises (purity, determinism, valid
// views/outcomes) need 30 s of game time; scoring itself is covered by test/rules.test.ts (AC3).
// 600 ticks (10 s) still crosses `intro` into `serve`/`rally` and drives several real and
// auto-returned swings.
testGameContract(game, { ticks: 600 });
