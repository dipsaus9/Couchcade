import { createRegistry } from "@couchcade/game-sdk/registry";

/**
 * Every game in `games/<id>` (docs/architecture/platform.md, "Auto-discovery registry"). Eager,
 * because the host needs every title and player count for the menu. Nobody edits a list of games:
 * a game plugs in by existing, and with no games yet the registry is empty.
 */
export const registry = createRegistry(
  import.meta.glob("../../../../games/*/src/index.ts", { eager: true, import: "default" }),
);
