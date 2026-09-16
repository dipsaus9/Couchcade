import { createControllerRegistry } from "@couchcade/game-sdk/registry";

/**
 * Every game's phone entry, found by folder (docs/architecture/platform.md, "Auto-discovery
 * registry"). The glob is lazy: nothing loads until a game starts. It covers only
 * `games/<id>/src/controller/index.ts`, never a game's `src/index.ts`, so rules and physics stay on
 * the TV (owner decision, 16 September 2026).
 */
export const controllers = createControllerRegistry(
  import.meta.glob("../../../../games/*/src/controller/index.ts", { import: "default" }),
);
