/**
 * `@couchcade/game-sdk/input`: pacing input to the free-tier budget (docs/architecture/session-flow.md,
 * "Real-time input batching", and docs/architecture/platform.md budget rules 4 and 5).
 *
 * - `rates.ts`: the phone and host send caps
 * - `stream.ts`: `createInputStream`, the phone's batching helper around the send helper
 * - `channel.ts`: `createInputChannel`, the `InputChannel` every controller gets (realtime-link.md,
 *   "Game SDK API sketch"), routing `stream` and `fire` over the direct link or the relay path
 * - `aim-playback.ts`: `addAimSamples` and `aimAt`, the host's aim playback 250 ms behind
 * - `playback.ts`: `addSample` and `createPlayback`, the generic stream playback with prediction
 *   that `aimAt` now wraps (docs/architecture/realtime-link.md, "Fallback detection and smoothing")
 *
 * Each concern is its own file in this folder and is re-exported here.
 */
export * from "./aim-playback.ts";
export * from "./channel.ts";
export * from "./playback.ts";
export * from "./rates.ts";
export * from "./stream.ts";
