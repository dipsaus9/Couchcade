import type { CouchcadeGame, HostSceneData } from "@couchcade/game-sdk/contract";
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

/**
 * The Phaser stage from `stage/boot.ts`. Phaser loads in its own chunk, so this module only holds a
 * type import and waits for `attachStage`.
 */
export const phaserStage: GameStage = {
  async start(game, data) {
    const [SceneClass, stage] = await Promise.all([game.hostScene(), booted]);
    stage.scene.add(game.id, SceneClass, true, data as unknown as object);
  },
  stop(game) {
    if (phaser?.scene.getScene(game.id)) phaser.scene.remove(game.id);
  },
};
