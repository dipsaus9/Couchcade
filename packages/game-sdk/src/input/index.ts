/**
 * `@couchcade/game-sdk/input`: pacing input to the free-tier budget (docs/architecture/session-flow.md,
 * "Real-time input batching", and docs/architecture/platform.md budget rules 4 and 5).
 *
 * - `rates.ts`: the phone and host send caps
 * - `stream.ts`: `createInputStream`, the phone's batching helper around the send helper
 *
 * Each concern is its own file in this folder and is re-exported here.
 */
export * from "./rates.ts";
export * from "./stream.ts";
