/**
 * `@couchcade/stage`: the TV overlays in Phaser. Game host scenes extend `StageScene` and use its
 * scoreboard, callouts and room code panel instead of drawing their own interface.
 *
 * Subpaths: `@couchcade/stage/scene`, `/scoreboard`, `/callout`, `/room-code`, `/layout`, `/draw`,
 * `/pips`.
 */
export * from "./scene/index.ts";
export * from "./scoreboard/index.ts";
export * from "./callout/index.ts";
export * from "./room-code/index.ts";
export * from "./layout/index.ts";
export * from "./draw/index.ts";
export * from "./pips/index.ts";
