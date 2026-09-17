import { color, typeScale } from "@couchcade/theme";
import type { Hex } from "@couchcade/theme";
import { drawSlab, textStyle } from "@couchcade/stage/draw";
import { metrics, safeArea, worldToOverlay } from "@couchcade/stage/layout";
import type { Rect } from "@couchcade/stage/layout";
import { roomCodeMetrics } from "@couchcade/stage/room-code";
import { GameObjects } from "phaser";
import type { Scene, Types } from "phaser";
import type { Box } from "./label-layout.ts";
import type { PipLabel } from "./present.ts";

/**
 * Quick Draw's small overlays, built from the stage's drawing primitives so they share the
 * scoreboard's outline, shadow and type (HOUSE_STYLE "Overlays: only from @couchcade/stage"):
 * the time or FOUL! tag over a Pip, the BANG! on a winner's flag, and the bottom instruction
 * panel. They go on the stage's overlay layer, above the world, and measure in overlay pixels
 * (1080p TV pixels).
 */

/** Numbers over the Pips: Pixelify Sans at the `body` size (32px on the TV). */
const tagText = (fill: Hex): Types.GameObjects.Text.TextStyle => ({
  ...textStyle("score", fill),
  fontSize: `${typeScale.body.tv}px`,
});

const tagPadX = 12;

/**
 * A pill over a Pip: a time in Ink on Chalk, or FOUL! in Chalk with an Ink outline on Signal
 * (HOUSE_STYLE "Colour": Chalk text on Signal needs the outline). Its origin is its bottom
 * centre, so it sits on top of the Pip's head. It measures and moves in overlay pixels.
 */
export class PipTag extends GameObjects.Container {
  #key: string | null = null;
  #text = "";
  #size = { width: 0, height: 0 };

  constructor(scene: Scene) {
    super(scene, 0, 0);
    this.setVisible(false);
  }

  /** The text on the tag, or null while hidden. */
  get text(): string | null {
    return this.visible ? this.#text : null;
  }

  /** The tag's box around its origin, shadow included, or null while hidden. */
  get box(): Box | null {
    if (!this.visible) return null;
    const left = this.x - Math.round(this.#size.width / 2);
    return {
      left,
      top: this.y - this.#size.height,
      right: left + this.#size.width,
      bottom: this.y,
    };
  }

  /**
   * Shows `label`, or hides the tag for null. Returns the tag's size, shadow included, so the
   * scene can place it before it moves.
   */
  setLabel(label: PipLabel | null): { width: number; height: number } | null {
    this.setVisible(label !== null);
    if (label === null) return null;
    const key = `${label.tone}:${label.text}`;
    if (key !== this.#key) this.#build(label, key);
    return this.#size;
  }

  /** Puts the tag's bottom centre at (`x`, `bottom`), plus the label's wobble. */
  place(label: PipLabel, x: number, bottom: number): void {
    this.setPosition(x + worldToOverlay(label.offsetX), bottom);
  }

  #build(label: PipLabel, key: string): void {
    this.removeAll(true);
    this.#key = key;
    this.#text = label.text;
    const foul = label.tone === "foul";
    const text = this.scene.make.text(
      {
        text: label.text,
        style: foul
          ? { ...tagText(color.chalk), stroke: color.ink, strokeThickness: metrics.outline * 2 }
          : tagText(color.ink),
      },
      false,
    );
    const width = Math.ceil(text.width) + 2 * tagPadX;
    const height = Math.ceil(text.height) + 2 * metrics.outline;
    this.#size = { width, height: height + metrics.depth };
    const rect = {
      x: -Math.round(width / 2),
      y: -height - metrics.depth,
      width,
      height,
    };
    const slab = this.scene.make.graphics({}, false);
    drawSlab(slab, rect, { radius: "pill", fill: foul ? color.signal : color.chalk });
    text.setOrigin(0.5).setPosition(rect.x + width / 2, rect.y + height / 2);
    this.add([slab, text]);
  }
}

/** The hard Ink shadow under BANG! (4px on the TV). */
const bangShadow = metrics.outline;

/** BANG! on a winner's flag: a small callout, Sunny with an Ink stroke and a hard Ink shadow. */
export function bangText(scene: Scene): GameObjects.Text {
  return scene.make
    .text(
      {
        text: "BANG!",
        style: {
          ...textStyle("score", color.sunny),
          fontSize: `${typeScale.action.tv}px`,
          stroke: color.ink,
          strokeThickness: metrics.outline * 2,
          shadow: {
            offsetX: 0,
            offsetY: bangShadow,
            color: color.ink,
            blur: 0,
            stroke: true,
            fill: true,
          },
          padding: { bottom: bangShadow },
        },
      },
      false,
    )
    .setOrigin(0.5, 1)
    .setAngle(-4)
    .setVisible(false);
}

/** The space between the instruction panel and the room code panel. */
const panelGap = 24;

/**
 * The instruction panel's box: the bottom row of the safe area, left of the room code panel.
 * `roomCodeLeft` is the room code panel's left edge. It defaults to where the narrowest room code
 * panel starts, so the panel is the same size with or without a room code.
 */
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

/**
 * The bottom instruction panel (HOUSE_STYLE "Screen layouts": whose turn and the instruction):
 * a Chalk panel with one line in Fredoka at the `body` size. It ends left of the stage's room code
 * panel in the bottom-right corner.
 */
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
      .setPosition(rect.x + 32, rect.y + rect.height / 2);
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
