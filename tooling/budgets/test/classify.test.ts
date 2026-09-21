import { describe, expect, it } from "vitest";
import type { BuiltItem } from "../src/classify.ts";
import { measureApp } from "../src/classify.ts";
import { gzipSize } from "../src/size.ts";

function chunk(
  fileName: string,
  facadeModuleId: string | null,
  moduleIds: string[] = [],
  edges: { imports?: string[]; dynamicImports?: string[] } = {},
): BuiltItem {
  return {
    type: "chunk",
    fileName,
    facadeModuleId,
    moduleIds,
    imports: edges.imports,
    dynamicImports: edges.dynamicImports,
    code: `// ${fileName}\n`,
  };
}

function asset(fileName: string, byteLength = 100): BuiltItem {
  return { type: "asset", fileName, source: new Uint8Array(byteLength) };
}

describe("measureApp", () => {
  it("counts a chunk with no game in its path as platform code", () => {
    const items = [chunk("index-abc.js", "/repo/apps/controller/src/main.ts")];
    const { platformGzipBytes, perGame } = measureApp(items, []);
    expect(platformGzipBytes).toBe(gzipSize("// index-abc.js\n"));
    expect(perGame.size).toBe(0);
  });

  it("groups chunks by the game folder in their facadeModuleId, discovered from output alone", () => {
    const items = [
      chunk("index-abc.js", "/repo/apps/controller/src/main.ts"),
      chunk("controller-a1.js", "/repo/games/quick-draw/src/controller/index.ts"),
      chunk("Controller-b2.js", "/repo/games/quick-draw/src/controller/Controller.vue"),
      chunk("controller-c3.js", "/repo/games/strike-night/src/controller/index.ts"),
    ];
    const { perGame, platformGzipBytes } = measureApp(items, []);

    expect([...perGame.keys()].toSorted()).toEqual(["quick-draw", "strike-night"]);
    // The two quick-draw chunks are summed into one bucket.
    const quickDrawExpected = gzipSize("// controller-a1.js\n") + gzipSize("// Controller-b2.js\n");
    expect(perGame.get("quick-draw")).toBe(quickDrawExpected);
    expect(perGame.get("strike-night")).toBe(gzipSize("// controller-c3.js\n"));
    // Only the non-game entry chunk counts as platform.
    expect(platformGzipBytes).toBe(gzipSize("// index-abc.js\n"));
  });

  it("never lets a game's chunk inflate the platform total", () => {
    const items = [
      chunk("index-abc.js", "/repo/apps/host/src/main.ts"),
      chunk("scene-xyz.js", "/repo/games/quick-draw/src/host/scene.ts"),
    ];
    const { platformGzipBytes } = measureApp(items, []);
    expect(platformGzipBytes).toBe(gzipSize("// index-abc.js\n"));
  });

  it("sums .woff2 assets as raw (already-compressed) bytes, ignoring other assets", () => {
    const items = [
      asset("fonts/fredoka.woff2", 17464),
      asset("fonts/pixelify.woff2", 3124),
      asset("index-abc.css", 5000),
    ];
    const { fontsRawBytes } = measureApp(items, []);
    expect(fontsRawBytes).toBe(17464 + 3124);
  });

  it("attributes a chunk to a vendor when one of its modules resolves into that npm package", () => {
    const items = [
      chunk("phaser-xyz.js", null, [
        "/repo/node_modules/.pnpm/phaser@4.2.1/node_modules/phaser/dist/phaser.esm.js",
      ]),
      chunk("index-abc.js", "/repo/apps/host/src/main.ts", ["/repo/apps/host/src/main.ts"]),
    ];
    const { vendorGzipBytes, platformGzipBytes } = measureApp(items, ["phaser"]);
    expect(vendorGzipBytes.get("phaser")).toBe(gzipSize("// phaser-xyz.js\n"));
    // A vendor chunk with no facade module id still counts toward the platform total too.
    expect(platformGzipBytes).toBe(gzipSize("// phaser-xyz.js\n") + gzipSize("// index-abc.js\n"));
  });

  it("reports zero for a tracked vendor no chunk resolves into", () => {
    const items = [chunk("index-abc.js", "/repo/apps/host/src/main.ts")];
    const { vendorGzipBytes } = measureApp(items, ["phaser"]);
    expect(vendorGzipBytes.get("phaser")).toBe(0);
  });

  it("excludes a shared chunk from platform once two or more games are its only importers", () => {
    // The shape a shared rules dependency takes once a second game also depends on it (CC-23.2):
    // no facade module of its own, reached only through each game's own lazily-loaded entry.
    const items = [
      chunk("index-abc.js", "/repo/apps/host/src/main.ts", [], {
        dynamicImports: ["src-strike.js", "src-bandeja.js"],
      }),
      chunk("src-strike.js", "/repo/games/strike-night/src/index.ts", [], {
        imports: ["physics-shared.js"],
      }),
      chunk("src-bandeja.js", "/repo/games/bandeja/src/index.ts", [], {
        imports: ["physics-shared.js"],
      }),
      chunk("physics-shared.js", null),
    ];
    const { platformGzipBytes, perGame } = measureApp(items, []);
    expect(platformGzipBytes).toBe(gzipSize("// index-abc.js\n"));
    expect(perGame.get("strike-night")).toBe(gzipSize("// src-strike.js\n"));
    expect(perGame.get("bandeja")).toBe(gzipSize("// src-bandeja.js\n"));
    // physics-shared.js counts nowhere: not platform (it never loads before a game is chosen),
    // and not duplicated into either game's own total.
  });

  it("still counts a shared chunk as platform when any importer isn't a game's own chunk", () => {
    // The platform's own boot sequence also code-splits through a dynamic import() it calls
    // unconditionally at startup, so a shared chunk reached that way must stay in the platform
    // total: only a chunk whose *every* importer is a recognised game entry is exempted.
    const items = [
      chunk("index-abc.js", "/repo/apps/host/src/main.ts", [], {
        dynamicImports: ["boot.js", "src-strike.js"],
      }),
      chunk("boot.js", "/repo/apps/host/src/stage/boot.ts", [], { imports: ["vendor-shared.js"] }),
      chunk("src-strike.js", "/repo/games/strike-night/src/index.ts", [], {
        imports: ["vendor-shared.js"],
      }),
      chunk("vendor-shared.js", null),
    ];
    const { platformGzipBytes, perGame } = measureApp(items, []);
    expect(perGame.get("strike-night")).toBe(gzipSize("// src-strike.js\n"));
    expect(platformGzipBytes).toBe(
      gzipSize("// index-abc.js\n") + gzipSize("// boot.js\n") + gzipSize("// vendor-shared.js\n"),
    );
  });

  it("still counts an unreferenced shared-looking chunk as platform (no importers found)", () => {
    const items = [chunk("mystery-shared.js", null)];
    const { platformGzipBytes } = measureApp(items, []);
    expect(platformGzipBytes).toBe(gzipSize("// mystery-shared.js\n"));
  });

  it("does not confuse a path that merely contains the substring 'games' with games/", () => {
    const items = [chunk("index-abc.js", "/repo/apps/host/src/minigames-lobby.ts")];
    const { platformGzipBytes, perGame } = measureApp(items, []);
    expect(perGame.size).toBe(0);
    expect(platformGzipBytes).toBe(gzipSize("// index-abc.js\n"));
  });

  it("excludes a matched lazy chunk from the platform total and tallies it on its own", () => {
    const items = [
      chunk("index-abc.js", "/repo/apps/controller/src/main.ts"),
      chunk("PipCustomiser-xyz.js", "/repo/apps/controller/src/pips/PipCustomiser.vue"),
    ];
    const { platformGzipBytes, lazyGzipBytes } = measureApp(
      items,
      [],
      [{ name: "Controller Pip customiser chunk", path: "apps/controller/src/pips/" }],
    );
    expect(platformGzipBytes).toBe(gzipSize("// index-abc.js\n"));
    expect(lazyGzipBytes.get("Controller Pip customiser chunk")).toBe(
      gzipSize("// PipCustomiser-xyz.js\n"),
    );
  });

  it("reports zero for a configured lazy matcher no chunk resolves into", () => {
    const items = [chunk("index-abc.js", "/repo/apps/controller/src/main.ts")];
    const { lazyGzipBytes } = measureApp(items, [], [{ name: "Never matched", path: "nowhere/" }]);
    expect(lazyGzipBytes.get("Never matched")).toBe(0);
  });

  it("still excludes a game chunk from platform even when a lazy matcher is configured", () => {
    const items = [
      chunk("index-abc.js", "/repo/apps/controller/src/main.ts"),
      chunk("controller-a1.js", "/repo/games/quick-draw/src/controller/index.ts"),
    ];
    const { platformGzipBytes, perGame } = measureApp(
      items,
      [],
      [{ name: "Controller Pip customiser chunk", path: "apps/controller/src/pips/" }],
    );
    expect(perGame.get("quick-draw")).toBe(gzipSize("// controller-a1.js\n"));
    expect(platformGzipBytes).toBe(gzipSize("// index-abc.js\n"));
  });
});
