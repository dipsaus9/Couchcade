import { color } from "@couchcade/theme";
import { drawSlab, textStyle } from "@couchcade/stage/draw";
import { metrics, safeArea, worldToOverlay } from "@couchcade/stage/layout";
import type { Rect } from "@couchcade/stage/layout";
import { roomCodeMetrics } from "@couchcade/stage/room-code";
import { GameObjects } from "phaser";
import type { Scene } from "phaser";

/**
 * Putt Club's own bottom instruction panel (docs/games/putt-club.md, "TV scene", "Overlays": "The
 * bottom instruction panel... follow[s] Quick Draw's and Strike Night's game-local pattern until
 * the stage package has them"). Built from the stage's drawing primitives so it shares the
 * scoreboard's outline, shadow and type (HOUSE_STYLE "Overlays: only from @couchcade/stage").
 */

const panelGap = 24;
const panelPad = 32;

/** The instruction panel's box: the bottom row of the safe area, left of the room code panel. */
export function instructionPanelRect(
  roomCodeLeft = safeArea.right - roomCodeMetrics.minWidth,
): Rect {
  return {
    x: safeArea.left,
    y: safeArea.bottom - metrics.depth - roomCodeMetrics.height,
    width:
      Math.min(roomCodeLeft, safeArea.right - roomCodeMetrics.minWidth) - panelGap - safeArea.left,
    height: roomCodeMetrics.height,
  };
}

/** A Chalk panel with one line in Fredoka at the `body` size (HOUSE_STYLE "Screen layouts"). */
export class InstructionPanel extends GameObjects.Container {
  readonly #line: GameObjects.Text;
  readonly rect: Rect;

  constructor(scene: Scene, roomCodeLeft?: number) {
    super(scene, 0, 0);
    const rect = instructionPanelRect(roomCodeLeft);
    this.rect = rect;
    const slab = scene.make.graphics({}, false);
    drawSlab(slab, rect);
    this.#line = scene.make
      .text({ text: "", style: textStyle("body") }, false)
      .setOrigin(0, 0.5)
      .setPosition(rect.x + panelPad, rect.y + rect.height / 2);
    this.add([slab, this.#line]);
  }

  get text(): string {
    return this.#line.text;
  }

  setText(text: string): this {
    if (text !== this.#line.text) this.#line.setText(text);
    return this;
  }
}

/**
 * The penalty/cap chip over a ball (TV scene, "Callouts": "a small Signal '+1' or '6' chip over
 * the ball, with a sound, and never name anyone"). Overlay text, positioned by converting the
 * ball's world spot with `worldToOverlay` (readability rule 1: "No text in the world").
 */
export class BallChip extends GameObjects.Text {
  constructor(scene: Scene) {
    super(scene, 0, 0, "", { ...textStyle("small", color.chalk), backgroundColor: color.signal });
    this.setOrigin(0.5, 1).setPadding(6, 3, 6, 3).setVisible(false);
  }

  showAt(text: string, worldX: number, worldY: number): this {
    return this.setText(text)
      .setPosition(worldToOverlay(worldX), worldToOverlay(worldY) - worldToOverlay(6))
      .setVisible(true);
  }

  hide(): this {
    return this.setVisible(false);
  }
}
