import type { CouchcadeGame, HostSceneData } from "@couchcade/game-sdk/contract";
import { font, typeScale } from "@couchcade/theme";
import type { Game } from "phaser";

/** Where a running game's host scene is shown. Tests pass a fake. */
export interface GameStage {
  /** Loads the game's scene and starts it with `data`. Rejects when the scene can't load. */
  start(game: CouchcadeGame, data: HostSceneData<unknown>): Promise<void>;
  /** Stops and removes the game's scene, if it is on the stage. */
  stop(game: CouchcadeGame): void;
}

let phaser: Game | null = null;
let attached: (game: Game) => void = () => {};
/** Resolves once main.ts has booted Phaser, so a game started early waits for the stage. */
const booted = new Promise<Game>((resolve) => (attached = resolve));

/** Hands the booted Phaser game to the runtime. main.ts calls it once Phaser's chunk has loaded. */
export function attachStage(game: Game): void {
  phaser = game;
  attached(game);
}

/** How long a scene waits for the fonts before it starts anyway, in a fallback font. */
export const fontWaitMs = 3_000;

/**
 * Loads every font and weight the TV type scale uses (the self-hosted Fredoka and Pixelify Sans,
 * CC-4.3). Phaser measures and rasterises text once, when it is created, so a scene that starts
 * before its font has loaded keeps the fallback font. The page's `@font-face` rules only download a
 * font once something uses it, so this asks for them. Never rejects, and gives up after
 * `fontWaitMs` so a missing font never stops a game.
 */
export function loadStageFonts(): Promise<void> {
  if (typeof document === "undefined" || !("fonts" in document)) return Promise.resolve();
  const faces = new Set(
    Object.values(typeScale).map(({ font: family, weight }) => `${weight} 32px ${font[family]}`),
  );
  const loaded = Promise.all([...faces].map((face) => document.fonts.load(face))).then(
    () => undefined,
    () => undefined,
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => (timer = setTimeout(resolve, fontWaitMs)));
  return Promise.race([loaded, timeout]).finally(() => clearTimeout(timer));
}

/**
 * The Phaser stage from `stage/boot.ts`. Phaser loads in its own chunk, so this module only holds a
 * type import and waits for `attachStage`. The stage fonts load before a scene starts.
 */
export const phaserStage: GameStage = {
  async start(game, data) {
    const [SceneClass, stage] = await Promise.all([game.hostScene(), booted, loadStageFonts()]);
    stage.scene.add(game.id, SceneClass, true, data as unknown as object);
  },
  stop(game) {
    if (phaser?.scene.getScene(game.id)) phaser.scene.remove(game.id);
  },
};
