import { font, motion, world } from "@couchcade/theme";
import type { HostSceneData, Player } from "@couchcade/game-sdk/contract";
import { Scene } from "phaser";
import type { GameObjects, Types } from "phaser";
import type { QuickDrawState } from "../shared/index.ts";
import { cuesBetween, quickDrawCueEvent } from "./cues.ts";
import type { QuickDrawCue } from "./cues.ts";
import {
  drawBackdrop,
  drawCrow,
  drawDust,
  drawFlag,
  drawGlint,
  drawPanel,
  drawPip,
  drawShape,
  drawTumbleweed,
  muzzle,
} from "./draw.ts";
import type { PipLook } from "./draw.ts";
import { bottomPanel, callout, safeArea, scoreboard, worldTextPx } from "./layout.ts";
import { palette, pipColors, seatLook, textColor } from "./palette.ts";
import { present } from "./present.ts";
import type { Presentation } from "./present.ts";

type Text = GameObjects.Text;

/** Scene key: the game id, which the host stage also uses to add and remove the scene. */
export const quickDrawSceneKey = "quick-draw";

/** How far the DRAW! pop grows, after its first frame. */
const popScale = 0.12;

const pixelText = (px: number, fill: string): Types.GameObjects.Text.TextStyle => ({
  fontFamily: font.pixel,
  fontSize: `${px}px`,
  fontStyle: "bold",
  color: fill,
});

const uiText = (px: number): Types.GameObjects.Text.TextStyle => ({
  fontFamily: font.ui,
  fontSize: `${px}px`,
  color: textColor.ink,
});

interface PipTexts {
  score: Text;
  label: Text;
  flag: Text;
}

/**
 * Quick Draw on the TV: a 480×270 desert street, drawn with placeholder shapes until CC-10.8
 * restyles it with `@couchcade/stage`. The host stage starts it with `HostSceneData`; every
 * frame it reads the latest state, emits the sound cues that changed (`quickDrawCueEvent`) and
 * draws `present(state)`. It never changes the state.
 */
export default class QuickDrawScene extends Scene {
  private host!: HostSceneData<QuickDrawState>;
  private actors!: GameObjects.Graphics;
  private overlay!: GameObjects.Graphics;
  private calloutText!: Text;
  private roundText!: Text;
  private panelText!: Text;
  private pipTexts: PipTexts[] = [];
  private looks = new Map<string, PipLook>();
  private previous: QuickDrawState | null = null;
  private calloutKey: string | null = null;
  private shakeNextFrame = false;

  constructor() {
    super({ key: quickDrawSceneKey });
  }

  init(data: HostSceneData<QuickDrawState>): void {
    this.host = data;
    this.previous = null;
    this.calloutKey = null;
    this.shakeNextFrame = false;
  }

  create(): void {
    const state = this.host.getState();
    this.cameras.main.setRoundPixels(true);
    drawBackdrop(this.add.graphics().setDepth(0));
    this.actors = this.add.graphics().setDepth(10);
    this.overlay = this.add.graphics().setDepth(20);

    this.looks = new Map(
      state.players.map((player, index) => {
        const seat = this.findSeat(player.id);
        const { jersey, shape } = seatLook(seat?.slot ?? index);
        return [player.id, { jersey, shape, ...pipColors(seat?.profile) }];
      }),
    );

    const bodyPx = worldTextPx("body");
    this.pipTexts = state.players.map(() => ({
      score: this.add
        .text(0, 0, "", pixelText(worldTextPx("score"), textColor.ink))
        .setOrigin(0, 0.5)
        .setDepth(21),
      label: this.add.text(0, 0, "", pixelText(bodyPx, textColor.ink)).setOrigin(0.5).setDepth(21),
      flag: this.add
        .text(0, 0, "BANG!", pixelText(bodyPx, textColor.ink))
        .setOrigin(0.5)
        .setDepth(21),
    }));
    this.roundText = this.add.text(0, 0, "", uiText(bodyPx)).setOrigin(0.5).setDepth(21);
    this.panelText = this.add
      .text(bottomPanel.x + 8, bottomPanel.y + bottomPanel.height / 2, "", uiText(bodyPx))
      .setOrigin(0, 0.5)
      .setDepth(21);
    this.calloutText = this.add
      .text(callout.x, callout.y, "", pixelText(worldTextPx("callout"), textColor.sunny))
      .setOrigin(0.5)
      .setAngle(callout.angle)
      // Callout treatment: 4 px Ink stroke and a hard 5 px Ink shadow straight down at 1080p.
      .setStroke(textColor.ink, 2)
      .setShadow(0, 1, textColor.ink, 0, true, true)
      .setDepth(30);

    this.paint(state);
  }

  override update(): void {
    this.paint(this.host.getState());
  }

  private findSeat(id: string): Player | undefined {
    return this.host.players.find((player) => player.id === id);
  }

  private paint(state: QuickDrawState): void {
    // The pop and shake play after DRAW!'s first frame, never before (spec, "TV scene").
    if (this.shakeNextFrame) {
      this.shakeNextFrame = false;
      if (!this.host.reducedMotion) this.cameras.main.shake(motion.ui.ms, 1 / world.width);
    }
    for (const cue of cuesBetween(this.previous, state)) this.emitCue(cue);
    this.previous = state;

    const view = present(state, { reducedMotion: this.host.reducedMotion });
    this.drawActors(view);
    this.drawOverlay(view);
    this.drawCallout(view);
  }

  private emitCue(cue: QuickDrawCue): void {
    if (cue.type === "draw") this.shakeNextFrame = true;
    this.events.emit(quickDrawCueEvent, cue);
  }

  private look(id: string): PipLook {
    const look = this.looks.get(id);
    if (look === undefined) throw new RangeError(`Quick Draw has no Pip for player ${id}`);
    return look;
  }

  private drawActors(view: Presentation): void {
    const g = this.actors.clear();
    if (view.tumbleweed) drawTumbleweed(g, view.tumbleweed.x, view.tumbleweed.frame);
    if (view.crow) drawCrow(g, view.crow.frame);

    // Back rows first, so nearer Pips stand in front.
    const order = view.pips
      .map((pip, index) => ({ pip, index }))
      .toSorted((a, b) => b.pip.slot.row - a.pip.slot.row);
    for (const { pip, index } of order) {
      drawPip(g, pip, this.look(pip.id));
      const texts = this.pipTexts[index];
      const flagAt = pip.flag === null ? null : drawFlag(g, pip, pip.flag);
      texts?.flag.setVisible(flagAt !== null);
      if (flagAt) texts?.flag.setPosition(flagAt.x, flagAt.y);
    }

    if (view.glint) {
      const pip = view.pips.find((candidate) => candidate.id === view.glint?.playerId);
      if (pip) {
        const at = muzzle(pip);
        drawGlint(g, at.x, at.y, view.glint.frame);
      }
    }
    if (view.dust) drawDust(g, view.dust.x, view.dust.frame);
  }

  private drawOverlay(view: Presentation): void {
    const g = this.overlay.clear();

    // Scoreboard: player chips in seat order, the round counter in the middle.
    const count = view.pips.length;
    const leftCount = Math.ceil(count / 2);
    const total = count * (scoreboard.chipWidth + scoreboard.gap) + scoreboard.roundChipWidth;
    let x = Math.round((world.width - total) / 2);
    const y = scoreboard.y;
    const chipAt = (index: number): void => {
      const pip = view.pips[index];
      const texts = this.pipTexts[index];
      if (!pip || !texts) return;
      const look = this.look(pip.id);
      drawPanel(g, x, y, scoreboard.chipWidth, scoreboard.height);
      drawShape(g, look.shape, x + 9, y + scoreboard.height / 2, look.jersey);
      texts.score.setText(String(pip.points)).setPosition(x + 18, y + scoreboard.height / 2);
      x += scoreboard.chipWidth + scoreboard.gap;
    };
    for (let i = 0; i < leftCount; i++) chipAt(i);
    const roundY = y - view.roundChipLift;
    drawPanel(g, x, roundY, scoreboard.roundChipWidth, scoreboard.height);
    this.roundText
      .setText(`Round ${view.round}`)
      .setPosition(x + scoreboard.roundChipWidth / 2, roundY + scoreboard.height / 2);
    x += scoreboard.roundChipWidth + scoreboard.gap;
    for (let i = leftCount; i < count; i++) chipAt(i);

    // Labels over the Pips: times on Chalk, FOUL! on Signal.
    view.pips.forEach((pip, index) => {
      const label = this.pipTexts[index]?.label;
      if (!label) return;
      label.setVisible(pip.label !== null);
      if (!pip.label) return;
      const cx = pip.slot.x + pip.label.offsetX;
      const cy = Math.max(safeArea.y + scoreboard.height + 8, pip.slot.feetY - 32);
      const foul = pip.label.tone === "foul";
      label
        .setText(pip.label.text)
        .setColor(foul ? textColor.chalk : textColor.ink)
        .setStroke(textColor.ink, foul ? 2 : 0)
        .setPosition(cx, cy);
      drawPanel(g, Math.round(cx - 15), cy - 6, 30, 11, foul ? palette.signal : palette.chalk);
    });

    drawPanel(g, bottomPanel.x, bottomPanel.y, bottomPanel.width, bottomPanel.height);
    this.panelText.setText(view.panel);
  }

  private drawCallout(view: Presentation): void {
    const shown = view.callout;
    this.calloutText.setVisible(shown !== null);
    if (!shown) {
      this.calloutKey = null;
      return;
    }
    const key = `${view.round}:${shown.kind}:${shown.text}`;
    const firstFrame = key !== this.calloutKey;
    this.calloutKey = key;
    // DRAW! is fully readable on its first frame; the pop follows. Reduced motion: no scaling.
    const popping =
      shown.kind === "draw" &&
      !firstFrame &&
      !this.host.reducedMotion &&
      shown.ageMs < motion.ui.ms;
    const scale = popping ? 1 + popScale * Math.sin((Math.PI * shown.ageMs) / motion.ui.ms) : 1;
    this.calloutText.setText(shown.text).setScale(scale);
  }
}
