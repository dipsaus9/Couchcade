/**
 * `@couchcade/game-sdk/rewind`: lag compensation for real-time games
 * (docs/architecture/session-flow.md, "Lag compensation with rewind").
 *
 * - `with-rewind.ts`: `withRewind`, the pure wrapper that applies late inputs at the tick the player
 *   acted in, up to 150 ms back
 *
 * Each concern is its own file in this folder and is re-exported here.
 */
export * from "./with-rewind.ts";
