/**
 * `@couchcade/game-sdk`: what a game builds on.
 *
 * - `@couchcade/game-sdk/contract`: `CouchcadeGame`, `defineGame`, `defineController`, fixed step
 * - `@couchcade/game-sdk/registry`: `createRegistry` (host) and `createControllerRegistry` (phone)
 * - `@couchcade/game-sdk/testing`: `testGameContract`, `createFakeRoom` and `replay`, tests only
 */
export * from "./contract/index.ts";
export * from "./registry/index.ts";
