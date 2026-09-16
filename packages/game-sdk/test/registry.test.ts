import { describe, expect, it, vi } from "vitest";
import {
  createControllerRegistry,
  createRegistry,
  gameIdOf,
  UnknownGameError,
} from "@couchcade/game-sdk/registry";
import drawRace from "../testing/fixtures/draw-race/src/index.ts";
import pickANumber from "../testing/fixtures/pick-a-number/src/index.ts";

// The apps glob games/*/src/index.ts the same way. Fixture games stand in for real ones.
const games = import.meta.glob("../testing/fixtures/*/src/index.ts", {
  eager: true,
  import: "default",
});
const controllers = import.meta.glob("../testing/fixtures/*/src/controller/index.ts", {
  import: "default",
});
// A glob that matches nothing, like games/*/src/index.ts before the first game exists.
const noGames = import.meta.glob("../testing/fixtures/*/src/no-such-entry.ts", {
  eager: true,
  import: "default",
});
const load = () => Promise.resolve({});
const noControllers = import.meta.glob("../testing/fixtures/*/src/controller/no-such-entry.ts", {
  import: "default",
});

describe("createRegistry", () => {
  it("discovers every game from the glob, with no list of games anywhere", () => {
    const registry = createRegistry(games);
    expect(registry.games.map((game) => game.id).toSorted()).toEqual([
      "draw-race",
      "pick-a-number",
    ]);
    expect(registry.get("draw-race")).toBe(drawRace);
    expect(registry.has("pick-a-number")).toBe(true);
    expect(registry.get("quick-draw")).toBeUndefined();
    expect(registry.has("quick-draw")).toBe(false);
  });

  it("sorts games by title, not by id", () => {
    expect(createRegistry(games).games.map((game) => game.title)).toEqual([
      "Best guess",
      "Draw race",
    ]);
  });

  it("is empty when no game folder exists yet", () => {
    expect(noGames).toEqual({});
    const registry = createRegistry(noGames);
    expect(registry.games).toEqual([]);
    expect(registry.has("draw-race")).toBe(false);
  });

  it("rejects a game whose id doesn't match its folder", () => {
    expect(() => createRegistry({ "../../games/quick-draw/src/index.ts": drawRace })).toThrow(
      "has id draw-race, but its folder is quick-draw",
    );
  });

  it("rejects two games with the same id", () => {
    expect(() =>
      createRegistry({
        "../../games/draw-race/src/index.ts": drawRace,
        "../../more-games/draw-race/src/index.ts": drawRace,
      }),
    ).toThrow("Game id draw-race is used by both");
  });

  it("rejects a module that isn't a valid game", () => {
    expect(() =>
      createRegistry({ "../../games/draw-race/src/index.ts": { ...drawRace, init: undefined } }),
    ).toThrow("init is not a function");
    expect(() => createRegistry({ "../../games/empty/src/index.ts": undefined })).toThrow(
      "is not an object",
    );
  });

  it("rejects a title over 16 characters, so it fits a menu card", () => {
    const long = { ...pickANumber, title: "A title too long!" };
    expect(() => createRegistry({ "../../games/pick-a-number/src/index.ts": long })).toThrow(
      "longer than 16 characters",
    );
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
  });

  it("rejects a path that isn't a file under <game-id>/src/", () => {
    expect(() => gameIdOf("../../games/quick-draw/index.ts")).toThrow("not a file under");
    expect(() => gameIdOf("../src/index.ts")).toThrow("not a file under");
    expect(() => gameIdOf("games/quick-draw/src")).toThrow("not a file under");
  });
});
