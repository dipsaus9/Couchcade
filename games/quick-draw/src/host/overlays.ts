import { color, typeScale } from "@couchcade/theme";
import type { Hex } from "@couchcade/theme";
import { drawSlab, textStyle } from "@couchcade/stage/draw";
import { metrics, safeArea, tvPx } from "@couchcade/stage/layout";
import { roomCodeMetrics } from "@couchcade/stage/room-code";
import { GameObjects } from "phaser";
import type { Scene, Types } from "phaser";
import type { PipLabel } from "./present.ts";

/**
 * Quick Draw's small overlays, built from the stage's drawing primitives so they share the
 * scoreboard's outline, shadow and type (HOUSE_STYLE "Overlays: only from @couchcade/stage"):
 * the time or FOUL! tag over a Pip, the BANG! on a winner's flag, and the bottom instruction
 * panel. They go on the stage's overlay layer, above the world.
 */

/** Numbers over the Pips: Pixelify Sans at the `body` size (32px on the TV, 8 world px). */
const tagText = (fill: Hex): Types.GameObjects.Text.TextStyle => ({
  ...textStyle("score", fill),
  fontSize: `${tvPx(typeScale.body.tv)}px`,
});

const tagPadX = Math.round(tvPx(12));

/**
 * A pill over a Pip: a time in Ink on Chalk, or FOUL! in Chalk with an Ink outline on Signal
 * (HOUSE_STYLE "Colour": Chalk text on Signal needs the outline). Its origin is its bottom
 * centre, so it sits on top of the Pip's head.
 */
export class PipTag extends GameObjects.Container {
  #key: string | null = null;
  #text = "";

  constructor(scene: Scene) {
    super(scene, 0, 0);
    this.setVisible(false);
  }

  /** The text on the tag, or null while hidden. */
  get text(): string | null {
    return this.visible ? this.#text : null;
  }

  show(label: PipLabel | null, x: number, bottom: number): void {
    this.setVisible(label !== null);
    if (label === null) return;
    const key = `${label.tone}:${label.text}`;
    if (key !== this.#key) this.#build(label, key);
    this.setPosition(x + label.offsetX, bottom);
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

/** BANG! on a winner's flag: a small callout, Sunny with an Ink stroke and a hard Ink shadow. */
export function bangText(scene: Scene): GameObjects.Text {
  return scene.make
    .text(
      {
        text: "BANG!",
        style: {
          ...textStyle("score", color.sunny),
          fontSize: `${tvPx(typeScale.action.tv)}px`,
          stroke: color.ink,
          strokeThickness: metrics.outline * 2,
          shadow: { offsetX: 0, offsetY: 1, color: color.ink, blur: 0, stroke: true, fill: true },
        },
      },
      false,
    )
    .setOrigin(0.5, 1)
    .setAngle(-4)
    .setVisible(false);
}

/** The instruction panel's box: the bottom row of the safe area, left of the room code panel. */
export const instructionPanelRect = (() => {
  const gap = Math.round(tvPx(24));
  const y = safeArea.bottom - metrics.depth - roomCodeMetrics.height;
  return {
    x: safeArea.left,
    y,
    width: safeArea.width - roomCodeMetrics.minWidth - gap,
    height: roomCodeMetrics.height,
  };
})();

/**
 * The bottom instruction panel (HOUSE_STYLE "Screen layouts": whose turn and the instruction):
 * a Chalk panel with one line in Fredoka at the `body` size. The bottom-right corner stays free
 * for the stage's room code panel.
 */
export class InstructionPanel extends GameObjects.Container {
  readonly #line: GameObjects.Text;

  constructor(scene: Scene) {
    super(scene, 0, 0);
    const rect = instructionPanelRect;
    const slab = scene.make.graphics({}, false);
    drawSlab(slab, rect);
    this.#line = scene.make
      .text({ text: "", style: textStyle("body") }, false)
      .setOrigin(0, 0.5)
      .setPosition(rect.x + Math.round(tvPx(32)), rect.y + rect.height / 2);
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
