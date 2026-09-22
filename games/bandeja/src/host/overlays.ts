import { drawSlab, textStyle } from "@couchcade/stage/draw";
import { metrics, safeArea } from "@couchcade/stage/layout";
import type { Rect } from "@couchcade/stage/layout";
import { roomCodeMetrics } from "@couchcade/stage/room-code";
import { GameObjects } from "phaser";
import type { Scene } from "phaser";

/**
 * Bandeja's own bottom instruction panel (docs/games/bandeja.md, "TV scene", "Overlays": "The
 * bottom instruction panel follows Quick Draw's game-local panel until the stage package has
 * one" -- finding 10). Built from the stage's drawing primitives so it shares the scoreboard's
 * outline, shadow and type (HOUSE_STYLE "Overlays: only from @couchcade/stage").
 */

const panelGap = 24;
const panelPad = 32;

/**
 * The instruction panel's box: the bottom row of the safe area, left of the room code panel.
 * `roomCodeLeft` defaults to where the narrowest room code panel starts, so the panel is the same
 * size with or without a room code. This is also the panel geometry `layout.ts`'s near-edge fix
 * (finding 11) is checked against: its top sits at `safeArea.bottom - metrics.depth -
 * roomCodeMetrics.height`, in world px 218, which is why the court's near edge is raised to 208.
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
