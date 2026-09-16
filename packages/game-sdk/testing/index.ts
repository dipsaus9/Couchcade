/**
 * `@couchcade/game-sdk/testing`: the contract test kit. Import it from tests only; it uses Vitest.
 */
export { gameContractChecks, testGameContract } from "./contract.ts";
export type { GameContractCheck, GameContractOptions } from "./contract.ts";
export { createFakeRoom } from "./fake-room.ts";
export type { FakeRoom, FakeRoomOptions, RecordedInput, Recording } from "./fake-room.ts";
export { createPlayers } from "./players.ts";
export { replay } from "./replay.ts";
export type { ReplayOptions } from "./replay.ts";
export { sampleInputs } from "./sample-inputs.ts";
