import { describe, expect, it, vi } from "vitest";
import {
  createControllerRegistry,
  createGameMetaRegistry,
  createLazyGameRegistry,
  gameIdOf,
  UnknownGameError,
} from "@couchcade/game-sdk/registry";
import type { CouchcadeGame, GameMeta } from "@couchcade/game-sdk/contract";
import drawRace from "../testing/fixtures/draw-race/src/index.ts";
import pickANumber from "../testing/fixtures/pick-a-number/src/index.ts";

// The apps glob games/*/src/meta.ts (eager) and games/*/src/index.ts (lazy) the same way.
// Fixture games stand in for real ones; `metaOf` mirrors what a real game's src/meta.ts exports.
const metaOf = (game: CouchcadeGame): GameMeta => ({
  id: game.id,
  title: game.title,
  players: game.players,
  realtime: game.realtime,
  needsMotion: game.needsMotion,
  scene: game.scene,
  ...(game.hidden === undefined ? {} : { hidden: game.hidden }),
});
const metas: Readonly<Record<string, unknown>> = {
  "../../games/draw-race/src/meta.ts": metaOf(drawRace),
  "../../games/pick-a-number/src/meta.ts": metaOf(pickANumber),
};
const noMetas: Readonly<Record<string, unknown>> = {};

const gameLoaders: Readonly<Record<string, () => Promise<unknown>>> = {
  "../../games/draw-race/src/index.ts": () => Promise.resolve(drawRace),
  "../../games/pick-a-number/src/index.ts": () => Promise.resolve(pickANumber),
};
const controllers = import.meta.glob("../testing/fixtures/*/src/controller/index.ts", {
  import: "default",
});
const noControllers = import.meta.glob("../testing/fixtures/*/src/controller/no-such-entry.ts", {
  import: "default",
});
const load = () => Promise.resolve({});

describe("createGameMetaRegistry", () => {
  it("discovers every game's metadata from the glob, with no list of games anywhere", () => {
    const registry = createGameMetaRegistry(metas);
    expect(registry.games.map((meta) => meta.id).toSorted()).toEqual([
      "draw-race",
      "pick-a-number",
    ]);
    expect(registry.get("draw-race")).toEqual(metaOf(drawRace));
    expect(registry.has("pick-a-number")).toBe(true);
    expect(registry.get("quick-draw")).toBeUndefined();
    expect(registry.has("quick-draw")).toBe(false);
  });

  it("sorts games by title, not by id", () => {
    expect(createGameMetaRegistry(metas).games.map((meta) => meta.title)).toEqual([
      "Best guess",
      "Draw race",
    ]);
  });

  it("is empty when no game folder exists yet", () => {
    const registry = createGameMetaRegistry(noMetas);
    expect(registry.games).toEqual([]);
    expect(registry.has("draw-race")).toBe(false);
  });

  it("rejects a game whose id doesn't match its folder", () => {
    expect(() =>
      createGameMetaRegistry({ "../../games/quick-draw/src/meta.ts": metaOf(drawRace) }),
    ).toThrow("has id draw-race, but its folder is quick-draw");
  });

  it("rejects two games with the same id", () => {
    expect(() =>
      createGameMetaRegistry({
        "../../games/draw-race/src/meta.ts": metaOf(drawRace),
        "../../more-games/draw-race/src/meta.ts": metaOf(drawRace),
      }),
    ).toThrow("Game id draw-race is used by both");
  });

  it("rejects an entry that isn't a valid GameMeta", () => {
    expect(() =>
      createGameMetaRegistry({
        "../../games/draw-race/src/meta.ts": { ...metaOf(drawRace), realtime: undefined },
      }),
    ).toThrow("realtime is not a boolean");
    expect(() => createGameMetaRegistry({ "../../games/empty/src/meta.ts": undefined })).toThrow(
      "is not an object",
    );
  });

  it("leaves out a hidden game, so the menu never lists it and nothing can start it", () => {
    const unfinished = { ...metaOf(pickANumber), hidden: true };
    const registry = createGameMetaRegistry({
      "../../games/draw-race/src/meta.ts": metaOf(drawRace),
      "../../games/pick-a-number/src/meta.ts": unfinished,
    });
    expect(registry.games.map((meta) => meta.id)).toEqual(["draw-race"]);
    expect(registry.has("pick-a-number")).toBe(false);
    expect(registry.get("pick-a-number")).toBeUndefined();
    const listed = createGameMetaRegistry({
      "../../games/pick-a-number/src/meta.ts": { ...metaOf(pickANumber), hidden: false },
    });
    expect(listed.has("pick-a-number")).toBe(true);
  });

  it("still checks a hidden game", () => {
    const broken = { ...metaOf(drawRace), hidden: true, realtime: undefined };
    expect(() => createGameMetaRegistry({ "../../games/draw-race/src/meta.ts": broken })).toThrow(
      "realtime is not a boolean",
    );
    expect(() =>
      createGameMetaRegistry({
        "../../games/quick-draw/src/meta.ts": { ...metaOf(drawRace), hidden: true },
      }),
    ).toThrow("but its folder is quick-draw");
  });

  it("rejects a title over 16 characters, so it fits a menu card", () => {
    const long = { ...metaOf(pickANumber), title: "A title too long!" };
    expect(() => createGameMetaRegistry({ "../../games/pick-a-number/src/meta.ts": long })).toThrow(
      "longer than 16 characters",
    );
  });
});

describe("createLazyGameRegistry", () => {
  it("knows every game by id without loading any", () => {
    const loaders = {
      "../../games/draw-race/src/index.ts": vi.fn<() => Promise<unknown>>(() =>
        Promise.resolve(drawRace),
      ),
    };
    const registry = createLazyGameRegistry(loaders);
    expect(registry.ids).toEqual(["draw-race"]);
    expect(registry.has("draw-race")).toBe(true);
    expect(loaders["../../games/draw-race/src/index.ts"]).not.toHaveBeenCalled();
  });

  it("loads a fixture game by id, once", async () => {
    const registry = createLazyGameRegistry(gameLoaders);
    expect(registry.ids.toSorted()).toEqual(["draw-race", "pick-a-number"]);
    const entry = await registry.load("pick-a-number");
    expect(entry).toBe(pickANumber);
    expect(await registry.load("pick-a-number")).toBe(entry);
  });

  it("is empty when no game folder exists yet", async () => {
    const registry = createLazyGameRegistry({});
    expect(registry.ids).toEqual([]);
    await expect(registry.load("draw-race")).rejects.toBeInstanceOf(UnknownGameError);
  });

  it("rejects an unknown id with UnknownGameError", async () => {
    const error = await createLazyGameRegistry(gameLoaders)
      .load("quick-draw")
      .catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(UnknownGameError);
    expect(error).toMatchObject({ gameId: "quick-draw" });
  });

  it("rejects an entry whose id doesn't match its folder, or that isn't a valid game", async () => {
    const registry = createLazyGameRegistry({
      "../../games/quick-draw/src/index.ts": () =>
        Promise.resolve({ ...drawRace, id: "draw-race" }),
      "../../games/broken/src/index.ts": () => Promise.resolve({ ...drawRace, init: undefined }),
    });
    await expect(registry.load("quick-draw")).rejects.toThrow("but its folder is quick-draw");
    await expect(registry.load("broken")).rejects.toThrow("init is not a function");
  });

  it("still loads (and checks) a hidden game: the metadata registry is what keeps it off the menu", async () => {
    const registry = createLazyGameRegistry({
      "../../games/draw-race/src/index.ts": () => Promise.resolve({ ...drawRace, hidden: true }),
    });
    const entry = await registry.load("draw-race");
    expect(entry.hidden).toBe(true);
  });
});

describe("createControllerRegistry", () => {
  it("knows every phone entry by id without loading any", () => {
    const loaders = {
      "../../games/draw-race/src/controller/index.ts": vi.fn<() => Promise<unknown>>(() =>
        Promise.resolve({}),
      ),
    };
    const registry = createControllerRegistry(loaders);
    expect(registry.ids).toEqual(["draw-race"]);
    expect(registry.has("draw-race")).toBe(true);
    expect(loaders["../../games/draw-race/src/controller/index.ts"]).not.toHaveBeenCalled();
  });

  it("loads a fixture phone entry by id, once", async () => {
    const registry = createControllerRegistry(controllers);
    expect(registry.ids).toEqual(["draw-race", "pick-a-number"]);
    const entry = await registry.load("pick-a-number");
    expect(entry.id).toBe("pick-a-number");
    expect(entry.component).toBeTypeOf("function");
    expect(await registry.load("pick-a-number")).toBe(entry);
  });

  it("is empty when no game folder exists yet", async () => {
    expect(noControllers).toEqual({});
    const registry = createControllerRegistry(noControllers);
    expect(registry.ids).toEqual([]);
    await expect(registry.load("draw-race")).rejects.toBeInstanceOf(UnknownGameError);
  });

  it("rejects an unknown id with UnknownGameError", async () => {
    const error = await createControllerRegistry(controllers)
      .load("quick-draw")
      .catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(UnknownGameError);
    expect(error).toMatchObject({ gameId: "quick-draw" });
  });

  it("rejects an entry whose id doesn't match its folder, or that is invalid", async () => {
    const registry = createControllerRegistry({
      "../../games/quick-draw/src/controller/index.ts": () =>
        Promise.resolve({ id: "draw-race", component: () => Promise.resolve({}) }),
      "../../games/broken/src/controller/index.ts": () => Promise.resolve({ id: "broken" }),
    });
    await expect(registry.load("quick-draw")).rejects.toThrow("but its folder is quick-draw");
    await expect(registry.load("broken")).rejects.toThrow("component is not a function");
  });

  it("rejects two entries with the same id", () => {
    expect(() =>
      createControllerRegistry({
        "a/draw-race/src/controller/index.ts": load,
        "b/draw-race/src/controller/index.ts": load,
      }),
    ).toThrow("Game id draw-race is used by both");
  });

  it("retries a load that failed, such as a dropped chunk", async () => {
    const entry = { id: "draw-race", component: () => Promise.resolve({}) };
    const loader = vi
      .fn<() => Promise<unknown>>()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValue(entry);
    const registry = createControllerRegistry({
      "games/draw-race/src/controller/index.ts": loader,
    });
    await expect(registry.load("draw-race")).rejects.toThrow("network");
    await expect(registry.load("draw-race")).resolves.toBe(entry);
    expect(loader).toHaveBeenCalledTimes(2);
  });
});

describe("gameIdOf", () => {
  it("takes the folder that holds src/", () => {
    expect(gameIdOf("../../../../games/quick-draw/src/index.ts")).toBe("quick-draw");
    expect(gameIdOf("../../../../games/quick-draw/src/controller/index.ts")).toBe("quick-draw");
    expect(gameIdOf("../../../../games/quick-draw/src/meta.ts")).toBe("quick-draw");
  });

  it("rejects a path that isn't a file under <game-id>/src/", () => {
    expect(() => gameIdOf("../../games/quick-draw/index.ts")).toThrow("not a file under");
    expect(() => gameIdOf("../src/index.ts")).toThrow("not a file under");
    expect(() => gameIdOf("games/quick-draw/src")).toThrow("not a file under");
  });
});
