/**
 * Strike Night's own overlays, built from the stage's drawing primitives so they share the
 * scoreboard's outline, shadow and type (HOUSE_STYLE "Overlays: only from @couchcade/stage"):
 * the bottom instruction panel with the turn clock (docs/games/strike-night.md, "TV scene",
 * "follows Quick Draw's game-local panel until the stage package has one"), the pin map and the
 * scorecard. They sit on the stage's overlay layer and measure in overlay pixels (1080p TV
 * pixels), so every letter and every pin dot is drawn at the TV's own resolution (CC-4.11).
 */
import { color, tint, toPhaserColor, typeScale } from "@couchcade/theme";
import { drawSlab, textStyle } from "@couchcade/stage/draw";
import { metrics, overlayFrame, safeArea } from "@couchcade/stage/layout";
import type { Rect } from "@couchcade/stage/layout";
import { roomCodeMetrics } from "@couchcade/stage/room-code";
import { scoreboardMetrics } from "@couchcade/stage/scoreboard";
import { GameObjects } from "phaser";
import type { Scene, Types } from "phaser";
import type { PinMapDot, ScorecardRow } from "./present.ts";

// --- The bottom instruction panel, with the last-5-seconds clock ---------------------------

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

/** The bottom panel: one Fredoka line at the `body` size, and the clock in Pixelify Sans at the
 * `score` size while the turn timer's last 5 seconds tick down. */
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

  get clock(): string | null {
    return this.#clock.visible ? this.#clock.text : null;
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

// --- The pin map: 10 circles, top right under the scoreboard --------------------------------

/** The bottom of the scoreboard chips' shadow, in overlay px, from `@couchcade/stage`'s own
 * measurements (the chip's lift, height, outline and shadow). */
const scoreboardBottom =
  safeArea.top +
  metrics.outline +
  scoreboardMetrics.lift +
  scoreboardMetrics.chipHeight +
  metrics.depth;

const pinMapDotSize = 32;
const pinMapDotGap = 6;
const pinMapRowGap = 4;
/** Row `r` (0 to 3) has `r + 1` pins, the head pin (row 0) nearest the camera. */
const pinMapRows = [1, 2, 3, 4] as const;

export const pinMapRect: Rect = {
  x: safeArea.right - 4 * (pinMapDotSize + pinMapDotGap),
  y: scoreboardBottom + 16,
  width: 4 * (pinMapDotSize + pinMapDotGap) - pinMapDotGap,
  height: 4 * (pinMapDotSize + pinMapRowGap) - pinMapRowGap,
};

/** A triangle of 10 pins (docs/games/strike-night.md, "Pin map"): standing pins Chalk, down
 * pins Ink at 20%, each with a 3 px Ink outline. */
export class PinMap extends GameObjects.Container {
  readonly #dots: GameObjects.Arc[] = [];

  constructor(scene: Scene) {
    super(scene, 0, 0);
    let index = 0;
    pinMapRows.forEach((count, row) => {
      const rowWidth = count * (pinMapDotSize + pinMapDotGap) - pinMapDotGap;
      const left = pinMapRect.x + (pinMapRect.width - rowWidth) / 2;
      for (let column = 0; column < count; column++) {
        const dot = scene.add
          .circle(
            left + column * (pinMapDotSize + pinMapDotGap) + pinMapDotSize / 2,
            pinMapRect.y + row * (pinMapDotSize + pinMapRowGap) + pinMapDotSize / 2,
            pinMapDotSize / 2,
            0,
          )
          .setStrokeStyle(3, 0);
        this.#dots[index] = dot;
        index += 1;
        this.add(dot);
      }
    });
    this.setVisible(false);
  }

  show(dots: readonly PinMapDot[] | null): void {
    this.setVisible(dots !== null);
    if (dots === null) return;
    dots.forEach((dot, index) => {
      const arc = this.#dots[index];
      if (!arc) return;
      const fill = dot.standing ? toPhaserColor(color.chalk) : toPhaserColor(tint.ink20);
      arc.setFillStyle(fill).setStrokeStyle(3, toPhaserColor(color.ink));
    });
  }
}

// --- The scorecard: one row per player, one cell per frame ----------------------------------

const scorecardMetrics = {
  width: 1400,
  pad: 32,
  titleHeight: 56,
  rowHeight: 56,
  nameWidth: 220,
  cellWidth: 108,
} as const;

const cellStyle = (): Types.GameObjects.Text.TextStyle => ({
  ...textStyle("small"),
  fontSize: `${typeScale.small.tv}px`,
});

function markLabel(mark: ScorecardRow["frames"][number]["mark"], score: number | null): string {
  if (mark === "strike") return "X";
  if (mark === "spare") return "/";
  if (score === 0) return "-";
  return "";
}

/** The scorecard (docs/games/strike-night.md, "Scorecard"): seat order, one cell per frame with
 * its mark and score, a Chalk panel that fits inside the safe area for up to 4 players. */
export class Scorecard extends GameObjects.Container {
  #key: string | null = null;
  #rect: Rect = { x: 0, y: 0, width: 0, height: 0 };

  constructor(scene: Scene) {
    super(scene, 0, 0);
    this.setVisible(false);
  }

  get rect(): Rect {
    return this.#rect;
  }

  show(rows: readonly ScorecardRow[] | null): void {
    this.setVisible(rows !== null);
    if (rows === null) return;
    const key = JSON.stringify(rows);
    if (key === this.#key) return;
    this.#key = key;
    this.#build(rows);
  }

  #build(rows: readonly ScorecardRow[]): void {
    this.removeAll(true);
    const m = scorecardMetrics;
    const height = m.pad + m.titleHeight + rows.length * m.rowHeight + m.pad;
    const rect: Rect = {
      x: Math.round((overlayFrame.width - m.width) / 2),
      y: Math.round((overlayFrame.height - height) / 2),
      width: m.width,
      height,
    };
    this.#rect = rect;
    const slab = this.scene.make.graphics({}, false);
    drawSlab(slab, rect);
    this.add(slab);

    const title = this.scene.make
      .text({ text: "Scorecard", style: textStyle("title") }, false)
      .setOrigin(0, 0.5)
      .setPosition(rect.x + m.pad, rect.y + m.pad + m.titleHeight / 2 - 8);
    this.add(title);

    rows.forEach((row, rowIndex) => {
      const top = rect.y + m.pad + m.titleHeight + rowIndex * m.rowHeight;
      const middle = top + m.rowHeight / 2;
      const name = this.scene.make
        .text({ text: row.name, style: textStyle("body") }, false)
        .setOrigin(0, 0.5)
        .setPosition(rect.x + m.pad, middle);
      this.add(name);

      row.frames.forEach((frame, frameIndex) => {
        const x = rect.x + m.pad + m.nameWidth + frameIndex * m.cellWidth + m.cellWidth / 2;
        const label = markLabel(frame.mark, frame.score);
        const shown = label !== "" ? label : (frame.score ?? "").toString();
        const text = this.scene.make
          .text({ text: shown, style: cellStyle() }, false)
          .setOrigin(0.5)
          .setPosition(x, middle);
        this.add(text);
      });

      // Right-aligned to the panel's own right edge, so a 2 or 3-digit total (Strike Night's
      // perfect game is 300) never runs past it, whatever the frame count reserves.
      const totalX = rect.x + rect.width - m.pad;
      const total = this.scene.make
        .text(
          {
            text: String(row.total),
            style: { ...textStyle("score"), fontSize: `${typeScale.score.tv}px` },
          },
          false,
        )
        .setOrigin(1, 0.5)
        .setPosition(totalX, middle);
      this.add(total);
    });
  }
}
