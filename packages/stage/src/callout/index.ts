import { color, motion, world } from "@couchcade/theme";
import { GameObjects, Math as PhaserMath } from "phaser";
import type { Scene, Time, Tweens } from "phaser";
import { textStyle } from "../draw/index.ts";
import { metrics, tvPx } from "../layout/index.ts";

/** The callout treatment (HOUSE_STYLE "Callout treatment"), in world pixels. */
export const calloutStyle = {
  /** Rotated −4°. */
  angle: -4,
  /**
   * The Ink stroke (4px on the TV). Canvas text draws the stroke centred on the letter edge and
   * the fill covers the inner half, so the stroke is twice the outline to show all of it.
   */
  strokeThickness: metrics.outline * 2,
  /** The hard Ink shadow straight down (5px on the TV). */
  shadowOffset: Math.max(1, Math.round(tvPx(5))),
  /** The `celebrate` screen shake (4px on the TV). */
  shake: metrics.outline,
} as const;

/**
 * Phaser eases for the theme motion tokens the callout uses. `pop` is the `celebrate` pop-in: it
 * overshoots and settles. The reduced motion fade is linear.
 */
const phaserEase: Record<string, string> = { pop: "Back.Out" };

export interface CalloutOptions {
  /** Centre of the callout. Defaults to the centre of the world. */
  x?: number;
  y?: number;
  /** Fade in without scaling or shaking (HOUSE_STYLE "Reduced motion"). */
  reducedMotion?: boolean;
  /** Shake the screen as part of `celebrate`. Defaults to true. Never shakes in reduced motion. */
  shake?: boolean;
  /** Dismiss after the entrance plus this many ms. Omit to keep it until `dismiss()`. */
  holdMs?: number;
}

/**
 * An in-game callout such as DRAW!, STRIKE! or FOUL!: uppercase Pixelify Sans in Sunny with an
 * Ink stroke and a hard Ink shadow, rotated −4°. `play()` pops it in with the `celebrate`
 * motion; with reduced motion it fades in instead.
 */
export class Callout extends GameObjects.Text {
  readonly reducedMotion: boolean;
  readonly #shake: boolean;
  readonly #holdMs: number | undefined;
  #entrance: Tweens.Tween | null = null;
  #timer: Time.TimerEvent | null = null;

  constructor(scene: Scene, text: string, options: CalloutOptions = {}) {
    super(scene, options.x ?? world.width / 2, options.y ?? world.height / 2, text.toUpperCase(), {
      ...textStyle("callout", color.sunny),
      stroke: color.ink,
      strokeThickness: calloutStyle.strokeThickness,
      shadow: {
        offsetX: 0,
        offsetY: calloutStyle.shadowOffset,
        color: color.ink,
        blur: 0,
        stroke: true,
        fill: true,
      },
      // Room for the shadow below the letters.
      padding: { bottom: calloutStyle.shadowOffset },
    });
    this.reducedMotion = options.reducedMotion ?? false;
    this.#shake = options.shake ?? true;
    this.#holdMs = options.holdMs;
    this.setOrigin(0.5).setAngle(calloutStyle.angle);
    this.once(GameObjects.Events.DESTROY, () => {
      this.#timer?.remove();
      this.#entrance?.remove();
    });
  }

  /** Duration of the entrance in ms: `celebrate`, or the `ui` fade with reduced motion. */
  get entranceMs(): number {
    return this.reducedMotion ? motion.ui.ms : motion.celebrate.ms;
  }

  /** Starts the entrance and, with `holdMs`, schedules the exit. */
  play(): this {
    this.#entrance?.remove();
    const { tweens, cameras } = this.scene;
    if (this.reducedMotion) {
      this.setScale(1).setAlpha(0);
      this.#entrance = tweens.add({
        targets: this,
        alpha: 1,
        duration: motion.ui.ms,
        ease: "Linear",
      });
    } else {
      this.setAlpha(1).setScale(0);
      this.#entrance = tweens.add({
        targets: this,
        scale: 1,
        duration: motion.celebrate.ms,
        ease: phaserEase[motion.celebrate.ease] ?? "Back.Out",
      });
      if (this.#shake) {
        cameras.main.shake(
          motion.celebrate.ms,
          new PhaserMath.Vector2(
            calloutStyle.shake / world.width,
            calloutStyle.shake / world.height,
          ),
        );
      }
    }
    if (this.#holdMs !== undefined) {
      this.#timer?.remove();
      this.#timer = this.scene.time.delayedCall(this.entranceMs + this.#holdMs, () =>
        this.dismiss(),
      );
    }
    return this;
  }

  /** Fades out (and shrinks, without reduced motion) over the `ui` duration, then destroys. */
  dismiss(): void {
    if (!this.scene) return;
    this.#timer?.remove();
    this.#entrance?.remove();
    this.scene.tweens.add({
      targets: this,
      alpha: 0,
      ...(this.reducedMotion ? {} : { scale: 0 }),
      duration: motion.ui.ms,
      ease: "Linear",
      onComplete: () => this.destroy(),
    });
  }
}
