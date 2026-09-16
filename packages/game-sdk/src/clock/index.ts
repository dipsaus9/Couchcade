/**
 * `@couchcade/game-sdk/clock`: time across devices (docs/architecture/platform.md, "Clock sync").
 *
 * - `estimate.ts`: the pure offset estimate from ping/pong samples
 *
 * Each concern is its own file in this folder and is re-exported here.
 */
export * from "./estimate.ts";
