import { motion } from "@couchcade/theme";
import type { HostSceneData } from "@couchcade/game-sdk/contract";
import { StageScene, metrics, shakeIntensity, worldToOverlay } from "@couchcade/stage";
import type { Callout, Scoreboard } from "@couchcade/stage";
import { Math as PhaserMath } from "phaser";
import type { GameObjects, Tweens } from "phaser";
import type { QuickDrawState } from "../shared/index.ts";
import { cuesBetween, quickDrawCueEvent } from "./cues.ts";
import type { QuickDrawCue } from "./cues.ts";
import { calloutAt } from "./layout.ts";
import { InstructionPanel, PipTag, bangText } from "./overlays.ts";
import { present } from "./present.ts";
import type { Presentation } from "./present.ts";
import { loadSprites } from "./sprites.ts";
import { PipActor, Props, buildBackdrop } from "./world.ts";
import { worldPipLook } from "./world-pip.ts";

/** Scene key: the game id, which the host stage also uses to add and remove the scene. */
export const quickDrawSceneKey = "quick-draw";

/**
 * How far into the `celebrate` pop-in (`Back.Out`) the callout first reaches full size. DRAW!
 * starts there, so it is fully readable on its first frame and the overshoot plays after it.
 */
const readableAtMs = (() => {
  for (let ms = 0; ms < motion.celebrate.ms; ms++) {
    if (PhaserMath.Easing.Back.Out(ms / motion.celebrate.ms) >= 1) return ms;
  }
  return motion.celebrate.ms;
})();

/** How far a Pip's tag sits above its feet, in world pixels: the Pip's height and a little air. */
const tagAboveFeet = 26;

/**
 * Quick Draw on the TV: the desert street from the game's CC0 and hand-drawn sprites, with the
 * stage's scoreboard, callouts and panels on the overlay layer. The host stage starts it with
 * `HostSceneData`; every frame it reads the latest state, emits the sound cues that changed
 * (`quickDrawCueEvent`) and shows `present(state)`. It never changes the state.
 */
export default class QuickDrawScene extends StageScene<QuickDrawState> {
  private host!: HostSceneData<QuickDrawState>;
  private props!: Props;
  private pips: PipActor[] = [];
  private tags: PipTag[] = [];
  private bangs: GameObjects.Text[] = [];
  private scoreboard!: Scoreboard;
  private panel!: InstructionPanel;
  private previous: QuickDrawState | null = null;
  private callout: { key: string; object: Callout; pop: Tweens.Tween | null } | null = null;
  private shakeNextFrame = false;

  constructor() {
    super({ key: quickDrawSceneKey });
  }

  init(): void {
    const host = this.hostData;
    if (host === undefined) throw new Error("Quick Draw starts with HostSceneData");
    this.host = host;
    this.previous = null;
    this.callout = null;
    this.shakeNextFrame = false;
  }

  preload(): void {
    loadSprites(this.load, this.textures);
  }

  create(): void {
    const state = this.host.getState();
    const view = present(state, { reducedMotion: this.reducedMotion });
    this.cameras.main.setRoundPixels(true);

    buildBackdrop(this);
    this.props = new Props(this);
    this.pips = view.pips.map((pip, index) => {
      const seat = this.host.players.find((player) => player.id === pip.id);
      return new PipActor(this, pip, worldPipLook(seat?.slot ?? index, seat?.profile));
    });

    this.scoreboard = this.addScoreboard({
      players: this.host.players,
      scores: this.scores(view),
      round: { current: view.round },
    });
    this.panel = new InstructionPanel(this);
    this.tags = view.pips.map(() => new PipTag(this));
    this.bangs = view.pips.map(() => bangText(this));
    // Tags go on top of the BANG! flags, so a winner's time is never covered.
    this.overlay.add([this.panel, ...this.bangs, ...this.tags]);

    this.paint(state);
  }

  override update(): void {
    this.paint(this.host.getState());
  }

  private scores(view: Presentation): Record<string, number> {
    return Object.fromEntries(view.pips.map((pip) => [pip.id, pip.points]));
  }

  private paint(state: QuickDrawState): void {
    // The shake plays after DRAW!'s first frame, never before (spec, "TV scene").
    if (this.shakeNextFrame) {
      this.shakeNextFrame = false;
      if (!this.reducedMotion) {
        this.cameras.main.shake(motion.celebrate.ms, shakeIntensity(this.cameras.main));
      }
    }
    for (const cue of cuesBetween(this.previous, state)) this.emitCue(cue);
    this.previous = state;

    const view = present(state, { reducedMotion: this.reducedMotion });
    this.paintWorld(view);
    this.paintOverlays(view);
    this.paintCallout(view);
  }

  private emitCue(cue: QuickDrawCue): void {
    this.events.emit(quickDrawCueEvent, cue);
  }

  private paintWorld(view: Presentation): void {
    this.props.showTumbleweed(view.tumbleweed);
    this.props.showCrow(view.crow);
    this.props.showDust(view.dust);
    view.pips.forEach((pip, index) => this.pips[index]?.update(pip));

    const glinting = view.glint
      ? this.pips[view.pips.findIndex((pip) => pip.id === view.glint?.playerId)]
      : undefined;
    this.props.showSparkle(glinting?.muzzle ?? null, view.glint?.frame ?? 0);
  }

  /** Overlays sit on the world in overlay pixels: every world position is multiplied by 4. */
  private paintOverlays(view: Presentation): void {
    this.scoreboard.setScores(this.scores(view)).setRound({ current: view.round });
    this.panel.setText(view.panel);
    view.pips.forEach((pip, index) => {
      const bang = this.bangs[index];
      const actor = this.pips[index];
      let tagBottom = worldToOverlay(pip.slot.feetY - tagAboveFeet);
      if (bang && actor) {
        bang.setVisible(pip.flag === 1);
        if (pip.flag !== null) {
          bang.setPosition(worldToOverlay(actor.flagTop.x), worldToOverlay(actor.flagTop.y - 1));
          // A winner's time sits above their BANG!, so neither covers the other.
          tagBottom = Math.min(tagBottom, Math.floor(bang.getBounds().top) - metrics.outline);
        }
      }
      this.tags[index]?.show(pip.label, worldToOverlay(pip.slot.x), tagBottom);
    });
  }

  /**
   * DRAW! and the fake words use the stage callout, one at a time, in the same place and with the
   * same entrance, so a fake looks exactly like DRAW!. The word is fully readable on its first
   * frame (spec, "TV scene"), so the entrance skips ahead: the `celebrate` pop starts where the
   * text first reaches full size and only its overshoot plays, and with reduced motion the word
   * appears at once, without the fade. The screen shake starts on the frame after.
   */
  private paintCallout(view: Presentation): void {
    const shown = view.callout;
    const key = shown ? `${view.round}:${shown.kind}:${shown.text}` : null;
    if (key === (this.callout?.key ?? null)) return;

    if (this.callout) {
      this.callout.pop?.remove();
      this.callout.object.dismiss();
      this.callout = null;
    }
    if (shown === null || key === null) return;

    const object = this.addCallout(shown.text, {
      x: worldToOverlay(calloutAt.x),
      y: worldToOverlay(calloutAt.y),
      shake: false,
    });
    this.tweens.killTweensOf(object);
    object.setScale(1).setAlpha(1);
    const pop = this.reducedMotion
      ? null
      : this.tweens.addCounter({
          from: readableAtMs,
          to: motion.celebrate.ms,
          duration: motion.celebrate.ms - readableAtMs,
          onUpdate: (tween) => {
            if (object.active) {
              const ms = tween.getValue() ?? motion.celebrate.ms;
              object.setScale(PhaserMath.Easing.Back.Out(ms / motion.celebrate.ms));
            }
          },
        });
    this.callout = { key, object, pop };
    this.shakeNextFrame = true;
  }
}
