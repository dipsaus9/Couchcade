/**
 * The auto-discovery registries (docs/architecture/platform.md, "Auto-discovery registry").
 *
 * Games plug in by existing in `games/<id>`. The apps own the `import.meta.glob` call, because a
 * package may not import from `games/` and Vite resolves a glob relative to the file that has it:
 *
 * ```ts
 * // apps/host: eager, the menu needs every title and player count
 * export const registry = createRegistry(
 *   import.meta.glob("../../../../games/*\/src/index.ts", { eager: true, import: "default" }),
 * );
 * // apps/controller: lazy, over each game's phone entry only
 * export const controllers = createControllerRegistry(
 *   import.meta.glob("../../../../games/*\/src/controller/index.ts", { import: "default" }),
 * );
 * ```
 *
 * Nobody edits a list of games. With no games yet the glob is `{}` and the registry is empty.
 * Phones never load a game's `src/index.ts`, so physics and host-only shared code stay off them
 * (owner decision, 16 September 2026).
 */
import { checkControllerDefinition, checkGameDefinition } from "../contract/index.ts";
import type { CouchcadeController, CouchcadeGame } from "../contract/index.ts";

export interface GameRegistry {
  /** Every game, sorted by title. */
  readonly games: readonly CouchcadeGame[];
  has(id: string): boolean;
  /** The game with this id, or undefined for an unknown id. */
  get(id: string): CouchcadeGame | undefined;
}

export interface ControllerRegistry {
  /** The id of every game with a phone entry, from its folder name, sorted. Loads nothing. */
  readonly ids: readonly string[];
  has(id: string): boolean;
  /**
   * Loads the phone entry for this id, once. Rejects with `UnknownGameError` for an id no game
   * folder has, and with a `TypeError` when the entry is invalid or its id doesn't match its
   * folder. A failed load isn't cached, so a dropped chunk can be retried.
   */
  load(id: string): Promise<CouchcadeController>;
}

/** Thrown for a game id the registry doesn't know, such as a game newer than this build. */
export class UnknownGameError extends Error {
  readonly gameId: string;

  constructor(gameId: string) {
    super(`No game with id ${gameId} in this build`);
    this.name = "UnknownGameError";
    this.gameId = gameId;
  }
}

/**
 * The game id of a glob key: the folder that holds `src/`. `../../games/quick-draw/src/index.ts`
 * and `../../games/quick-draw/src/controller/index.ts` both give `quick-draw`.
 */
export function gameIdOf(path: string): string {
  const segments = path.split("/");
  const src = segments.lastIndexOf("src");
  const folder = src > 0 ? segments[src - 1] : undefined;
  if (folder === undefined || folder === "." || folder === ".." || src === segments.length - 1) {
    throw new Error(`Registry entry ${path} is not a file under <game-id>/src/`);
  }
  return folder;
}

/** Maps glob keys to game ids. Throws when two keys belong to folders with the same name. */
function pathsById(paths: readonly string[]): Map<string, string> {
  const byId = new Map<string, string>();
  for (const path of paths) {
    const id = gameIdOf(path);
    const other = byId.get(id);
    if (other !== undefined) throw new Error(`Game id ${id} is used by both ${other} and ${path}`);
    byId.set(id, path);
  }
  return byId;
}

/** Throws unless the entry has no problems and its id equals its folder name. */
function expectEntry(path: string, id: string, entry: unknown, problems: string[]): void {
  if (problems.length > 0) {
    throw new TypeError(`Entry ${path} is invalid: ${problems.join("; ")}`);
  }
  const entryId = (entry as { id: string }).id;
  if (entryId !== id) {
    throw new TypeError(`Entry ${path} has id ${entryId}, but its folder is ${id}`);
  }
}

/**
 * Builds the host registry from an eager glob: `{ "<...>/<id>/src/index.ts": game }`. Throws when
 * a module isn't a valid game (see `checkGameDefinition`), when an id doesn't match its folder, or
 * when two games share an id.
 */
export function createRegistry(modules: Readonly<Record<string, unknown>>): GameRegistry {
  const games = [...pathsById(Object.keys(modules))]
    .map(([id, path]) => {
      const game = modules[path];
      expectEntry(path, id, game, checkGameDefinition(game));
      return game as CouchcadeGame;
    })
    .toSorted((a, b) => a.title.localeCompare(b.title, "en") || a.id.localeCompare(b.id, "en"));
  const byId = new Map(games.map((game) => [game.id, game]));

  return {
    games,
    has: (id) => byId.has(id),
    get: (id) => byId.get(id),
  };
}

/**
 * Builds the phone registry from a lazy glob:
 * `{ "<...>/<id>/src/controller/index.ts": () => import(...) }`. Ids come from folder names, so
 * nothing loads until `load(id)`. Throws when two entries share an id.
 */
export function createControllerRegistry(
  loaders: Readonly<Record<string, () => Promise<unknown>>>,
): ControllerRegistry {
  const byId = pathsById(Object.keys(loaders));
  const ids = [...byId.keys()].toSorted((a, b) => a.localeCompare(b, "en"));
  const loading = new Map<string, Promise<CouchcadeController>>();

  return {
    ids,
    has: (id) => byId.has(id),
    load(id) {
      const path = byId.get(id);
      const loader = path === undefined ? undefined : loaders[path];
      if (path === undefined || loader === undefined) {
        return Promise.reject(new UnknownGameError(id));
      }
      let entry = loading.get(id);
      if (entry === undefined) {
        entry = loader().then((controller) => {
          expectEntry(path, id, controller, checkControllerDefinition(controller));
          return controller as CouchcadeController;
        });
        entry.catch(() => loading.delete(id));
        loading.set(id, entry);
      }
      return entry;
    },
  };
}
