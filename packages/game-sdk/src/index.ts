/**
 * `@couchcade/game-sdk`: what a game builds on.
 *
 * - `@couchcade/game-sdk/contract`: `CouchcadeGame`, `GameMeta`, `defineGame`, `defineGameMeta`,
 *   `defineController`, fixed step
 * - `@couchcade/game-sdk/registry`: `createGameMetaRegistry` (eager, host menu),
 *   `createLazyGameRegistry` (a game's rules, loaded once a room starts it) and
 *   `createControllerRegistry` (phone)
 * - `@couchcade/game-sdk/testing`: `testGameContract`, `createFakeRoom` and `replay`, tests only
 */
export * from "./contract/index.ts";
export * from "./registry/index.ts";
