import type { HostSceneData } from "@couchcade/game-sdk/contract";
import { Scene, Scenes } from "phaser";
import type { GameObjects } from "phaser";
import { Callout } from "../callout/index.ts";
import type { CalloutOptions } from "../callout/index.ts";
import { OVERLAY_DEPTH } from "../layout/index.ts";
import { RoomCodePanel } from "../room-code/index.ts";
import type { RoomCodeOptions } from "../room-code/index.ts";
import { Scoreboard } from "../scoreboard/index.ts";
import type { ScoreboardOptions } from "../scoreboard/index.ts";

/**
 * The base class for every game's TV scene. It owns the overlay layer, which draws above the
 * game world, and puts the house style overlays on it: games never draw their own interface
 * (HOUSE_STYLE "How the style is enforced").
 *
 * ```ts
 * export default class QuickDrawScene extends StageScene<QuickDrawState> {
 *   constructor() { super("quick-draw"); }
 *   create() {
 *     this.add.image(240, 135, "desert");             // the world
 *     this.addScoreboard({ players: this.hostData!.players });
 *     this.addCallout("Draw!", { holdMs: 600 });     // on the overlay
 *   }
 * }
 * ```
 */
export class StageScene<TState = unknown> extends Scene {
  #overlay: GameObjects.Layer | null = null;

  /**
   * The overlay layer. Created on first use, at a depth above anything in the world, so its
   * position in the display list doesn't matter. Everything on it ignores world depth sorting.
   */
  get overlay(): GameObjects.Layer {
    if (!this.#overlay) {
      const layer = this.add.layer().setName("stage-overlay").setDepth(OVERLAY_DEPTH);
      this.#overlay = layer;
      // A restarted scene gets a fresh display list, and so a fresh overlay.
      this.events.once(Scenes.Events.SHUTDOWN, () => {
        if (this.#overlay === layer) this.#overlay = null;
      });
    }
    return this.#overlay;
  }

  /** What the host runtime started the scene with, or undefined when started without it. */
  get hostData(): HostSceneData<TState> | undefined {
    const data = this.sys.settings.data as Partial<HostSceneData<TState>> | undefined;
    return typeof data?.getState === "function" ? (data as HostSceneData<TState>) : undefined;
  }

  /** The host's reduced motion setting. Overlays read it when they animate. */
  get reducedMotion(): boolean {
    return this.hostData?.reducedMotion ?? false;
  }

  /** Adds the scoreboard to the overlay, across the top of the safe area. */
  addScoreboard(options: ScoreboardOptions): Scoreboard {
    const scoreboard = new Scoreboard(this, options);
    this.overlay.add(scoreboard);
    return scoreboard;
  }

  /** Adds a callout to the overlay and plays its entrance, honouring reduced motion. */
  addCallout(text: string, options: CalloutOptions = {}): Callout {
    const callout = new Callout(this, text, { reducedMotion: this.reducedMotion, ...options });
    this.overlay.add(callout);
    return callout.play();
  }

  /** Adds the room code panel to the overlay, in the bottom-right corner of the safe area. */
  addRoomCode(options: RoomCodeOptions): RoomCodePanel {
    const panel = new RoomCodePanel(this, options);
    this.overlay.add(panel);
    return panel;
  }
}
