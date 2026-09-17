/**
 * `@couchcade/game-sdk/clock`: time across devices (docs/architecture/platform.md, "Clock sync").
 *
 * - `estimate.ts`: the pure offset estimate from ping/pong samples
 * - `room-clock.ts`: `createRoomClock`, the shared `roomClock` and `toHostTime`
 * - `display-lag.ts`: the TV lag the host calibrated (CC-3.8), `getDisplayLagMs`
 *
 * Each concern is its own file in this folder and is re-exported here.
 */
export * from "./display-lag.ts";
export * from "./estimate.ts";
export * from "./room-clock.ts";
