import { color, players as playerTokens, tint, typeScale } from "@couchcade/theme";
import { SHAPE_SIZE, drawPlayerShape, drawSlab, textStyle } from "@couchcade/stage/draw";
import { metrics, overlayFrame, safeArea } from "@couchcade/stage/layout";
import type { Rect } from "@couchcade/stage/layout";
import { roomCodeMetrics } from "@couchcade/stage/room-code";
import { scoreboardMetrics } from "@couchcade/stage/scoreboard";
import { GameObjects, Math as PhaserMath } from "phaser";
import type { Scene, Types } from "phaser";
import type { Box } from "./label-layout.ts";
import type { PointsTagPresentation, RoundResultsPresentation } from "./present.ts";

/**
 * Target Range's own overlays, built from the stage's drawing primitives so they share the
 * scoreboard's outline, shadow and type (HOUSE_STYLE "Overlays: only from @couchcade/stage"): the
 * bottom instruction panel with the volley clock, the points tags under the scoreboard chips, and
 * the results panel between rounds. They go on the stage's overlay layer and measure in overlay
 * pixels (1080p TV pixels), so every letter is drawn at the TV's own resolution.
 */

/** The space between the instruction panel and the room code panel. */
const panelGap = 24;
/** Space between a panel's outline and its text. */
const panelPad = 32;

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
 * The bottom instruction panel (HOUSE_STYLE "Screen layouts": the instruction): a Chalk panel
 * with one line in Fredoka at the `body` size, and the volley clock in Pixelify Sans at the
 * `score` size on its right while a volley is open. It ends left of the room code panel.
 */
export class InstructionPanel extends GameObjects.Container {
  readonly #line: GameObjects.Text;
  readonly #clock: GameObjects.Text;
  readonly rect: Rect;

  constructor(scene: Scene, roomCodeLeft?: number) {
    super(scene, 0, 0);
    const rect = instructionPanelRect(roomCodeLeft);
    this.rect = rect;
    const slab = scene.make.graphics({}, false);
    drawSlab(slab, rect);
    const middle = rect.y + rect.height / 2;
    this.#line = scene.make
      .text({ text: "", style: textStyle("body") }, false)
      .setOrigin(0, 0.5)
      .setPosition(rect.x + panelPad, middle);
    this.#clock = scene.make
      .text({ text: "", style: textStyle("score") }, false)
      .setOrigin(1, 0.5)
      .setPosition(rect.x + rect.width - panelPad, middle)
      .setVisible(false);
    this.add([slab, this.#line, this.#clock]);
  }

  get text(): string {
    return this.#line.text;
  }

  /** The clock as shown, or null while it's hidden. */
  get clock(): string | null {
    return this.#clock.visible ? this.#clock.text : null;
  }

  /** The line's and the clock's text objects, for layout checks. */
  get texts(): readonly GameObjects.Text[] {
    return [this.#line, this.#clock];
  }

  setText(text: string): this {
    if (text !== this.#line.text) this.#line.setText(text);
    return this;
  }

  setClock(seconds: number | null): this {
    this.#clock.setVisible(seconds !== null);
    const text = seconds === null ? "" : String(seconds);
    if (text !== this.#clock.text) this.#clock.setText(text);
    return this;
  }
}

/** Space between a scoreboard chip's shadow and the points tag under it. */
export const tagGap = 12;
const tagPadX = 16;

/** Arrow points in Pixelify Sans at the `action` size (40px on the TV). */
const tagStyle = (): Types.GameObjects.Text.TextStyle => ({
  ...textStyle("score"),
  fontSize: `${typeScale.action.tv}px`,
});

/**
 * A pill under a player's scoreboard chip with their arrow's points during the reveal: Ink on
 * Sunny for a bullseye, Ink on Chalk otherwise. Its position is its centre, so the `ui` pop-in
 * scales it in place. It measures and moves in overlay pixels.
 */
export class PointsTag extends GameObjects.Container {
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

  /** The text object, for layout checks. */
  get label(): GameObjects.Text | undefined {
    return this.list.find((child): child is GameObjects.Text => child instanceof GameObjects.Text);
  }

  /** Shows `tag`, or hides the tag for null. Returns its size, shadow included, at full scale. */
  setTag(tag: PointsTagPresentation | null): { width: number; height: number } | null {
    this.setVisible(tag !== null);
    if (tag === null) return null;
    const key = `${tag.tone}:${tag.text}`;
    if (key !== this.#key) this.#build(tag, key);
    this.setScale(tag.pop >= 1 ? 1 : PhaserMath.Easing.Back.Out(tag.pop));
    return this.#size;
  }

  /** Puts the tag in `box`, the box its full-size pill and shadow fill. */
  place(box: Box): void {
    this.setPosition(
      box.left + this.#size.width / 2,
      box.top + (this.#size.height - metrics.depth) / 2,
    );
  }

  /** The full-size box the tag was placed in, or null while hidden. */
  get box(): Box | null {
    if (!this.visible) return null;
    const left = this.x - this.#size.width / 2;
    const top = this.y - (this.#size.height - metrics.depth) / 2;
    return { left, top, right: left + this.#size.width, bottom: top + this.#size.height };
  }

  #build(tag: PointsTagPresentation, key: string): void {
    this.removeAll(true);
    this.#key = key;
    this.#text = tag.text;
    const text = this.scene.make.text({ text: tag.text, style: tagStyle() }, false).setOrigin(0.5);
    const width = Math.ceil(text.width) + 2 * tagPadX + 2 * metrics.outline;
    const height = Math.ceil(text.height) + 2 * metrics.outline;
    this.#size = { width, height: height + metrics.depth };
    const slab = this.scene.make.graphics({}, false);
    drawSlab(
      slab,
      { x: -width / 2, y: -height / 2, width, height },
      { radius: "pill", fill: tag.tone === "bullseye" ? color.sunny : color.chalk },
    );
    this.add([slab, text]);
  }
}

/** The bottom of the scoreboard chips' shadow: 144 overlay px. */
export const scoreboardBottom =
  safeArea.top +
  metrics.outline +
  scoreboardMetrics.lift +
  scoreboardMetrics.chipHeight +
  metrics.depth;

/** Round results measurements in overlay pixels. */
export const resultsMetrics = {
  width: 960,
  pad: 40,
  titleHeight: 72,
  headerHeight: 44,
  rowHeight: 64,
  /** Left edges of the columns, from the panel's left edge. */
  nameX: 40 + SHAPE_SIZE * metrics.outline + 16,
  arrowsX: 400,
  arrowWidth: 96,
  roundX: 700,
  totalRight: 960 - 40,
} as const;

/**
 * The results panel's box for `rows` players: centred across the TV, hanging a fixed gap below the
 * scoreboard, so its title stays in the same place whatever the player count. With 8 players it
 * ends above the bottom panels.
 */
export function resultsRect(rows: number): Rect {
  const { width, pad, titleHeight, headerHeight, rowHeight } = resultsMetrics;
  const height = pad + titleHeight + headerHeight + rows * rowHeight + pad - 16;
  return {
    x: Math.round((overlayFrame.width - width) / 2),
    y: scoreboardBottom + 24,
    width,
    height,
  };
}

/**
 * The results between rounds: a Chalk panel with the round's title and one row per player, most
 * points first. Each row has the player's shape and name, the points of the round's three arrows
 * (a dash for a late shot or no shot), the round's points and the match total.
 */
export class RoundResults extends GameObjects.Container {
  #key: string | null = null;
  #rect: Rect = { x: 0, y: 0, width: 0, height: 0 };

  constructor(scene: Scene) {
    super(scene, 0, 0);
    this.setVisible(false);
  }

  get rect(): Rect {
    return this.#rect;
  }

  /** Every text object in the panel, for layout checks. */
  get texts(): readonly GameObjects.Text[] {
    return this.list.filter(
      (child): child is GameObjects.Text => child instanceof GameObjects.Text,
    );
  }

  /** Shows `results` for players in `slots` (seat by id), or hides the panel for null. */
  show(results: RoundResultsPresentation | null, slotOf: (id: string) => number): void {
    this.setVisible(results !== null);
    if (results === null) return;
    const key = JSON.stringify(results);
    if (key === this.#key) return;
    this.#key = key;
    this.#build(results, slotOf);
  }

  #build(results: RoundResultsPresentation, slotOf: (id: string) => number): void {
    this.removeAll(true);
    const m = resultsMetrics;
    const rect = resultsRect(results.rows.length);
    this.#rect = rect;
    const slab = this.scene.make.graphics({}, false);
    drawSlab(slab, rect);
    this.add(slab);

    const text = (
      content: string,
      style: Types.GameObjects.Text.TextStyle,
      x: number,
      y: number,
      originX: number,
    ) => {
      const object = this.scene.make
        .text({ text: content, style }, false)
        .setOrigin(originX, 0.5)
        .setPosition(x, y);
      this.add(object);
      return object;
    };

    const left = rect.x;
    const titleY = rect.y + m.pad + m.titleHeight / 2 - 8;
    text(results.title, textStyle("title"), left + m.pad, titleY, 0);

    const headerY = rect.y + m.pad + m.titleHeight + m.headerHeight / 2 - 8;
    const hint = textStyle("small", tint.ink70);
    text("Arrows", hint, left + m.arrowsX + (3 * m.arrowWidth) / 2, headerY, 0.5);
    text("Round", hint, left + m.roundX + m.arrowWidth / 2, headerY, 0.5);
    text("Total", hint, left + m.totalRight, headerY, 1);

    const cell = { ...textStyle("score"), fontSize: `${typeScale.action.tv}px` };
    const shapes = this.scene.make.graphics({}, false);
    results.rows.forEach((row, index) => {
      const top = rect.y + m.pad + m.titleHeight + m.headerHeight + index * m.rowHeight;
      const middle = top + m.rowHeight / 2;
      const token = playerTokens[slotOf(row.id)] ?? playerTokens[0];
      const shapeSize = SHAPE_SIZE * metrics.outline;
      drawPlayerShape(
        shapes,
        token.shape,
        token.color,
        left + m.pad,
        Math.round(middle - shapeSize / 2),
        metrics.outline,
      );
      text(row.name, textStyle("body"), left + m.nameX, middle, 0);
      row.arrows.forEach((points, arrow) => {
        text(
          points === null ? "-" : String(points),
          cell,
          left + m.arrowsX + arrow * m.arrowWidth + m.arrowWidth / 2,
          middle,
          0.5,
        );
      });
      text(String(row.roundPoints), cell, left + m.roundX + m.arrowWidth / 2, middle, 0.5);
      text(String(row.points), cell, left + m.totalRight, middle, 1);
    });
    this.add(shapes);
  }
}
