import { createGameMetaRegistry, createLazyGameRegistry } from "@couchcade/game-sdk/registry";

/**
 * Every game in `games/<id>` (docs/architecture/platform.md, "Auto-discovery registry", CC-3.25).
 * `metaRegistry` is eager: the menu needs every title and player count before any room has picked
 * a game, and a game's metadata (`src/meta.ts`) is small enough to bundle for free. `gameRegistry`
 * is lazy: a game's full rules (`src/index.ts`, physics included) load once, only when a room
 * actually starts that game, so a heavy game never inflates the platform bundle every game pays
 * for. Nobody edits a list of games: a game plugs in by existing, and with no games yet both
 * registries are empty.
 */
export const metaRegistry = createGameMetaRegistry(
  import.meta.glob("../../../../games/*/src/meta.ts", { eager: true, import: "default" }),
);

export const gameRegistry = createLazyGameRegistry(
  import.meta.glob("../../../../games/*/src/index.ts", { import: "default" }),
);
