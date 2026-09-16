import { GameObjects } from "phaser";
import type { Scene } from "phaser";
import { drawSlab, textStyle } from "../draw/index.ts";
import { metrics, safeArea, tvPx } from "../layout/index.ts";
import type { Rect } from "../layout/index.ts";

/** Room code panel measurements in world pixels, from the 1080p TV footer in the design canvas. */
export const roomCodeMetrics = {
  /** Smallest panel width (420px on the TV). It grows for a long join URL. */
  minWidth: Math.round(tvPx(420)),
  /** Panel height (148px on the TV, the bottom 15% row). */
  height: Math.round(tvPx(148)),
  /** Space between the outline and the text (32px on the TV). */
  padX: Math.round(tvPx(32)),
  /** Space between the code and the URL (4px on the TV). */
  gap: Math.round(tvPx(4)),
} as const;

export interface RoomCodeOptions {
  /** The room code, such as `BEAN`. */
  code: string;
  /** The join address shown under the code, such as `couchcade.workers.dev`. */
  url: string;
}

/**
 * The room code panel (HOUSE_STYLE "Room code"): the code in Pixelify Sans at `score` size on a
 * Chalk panel with the join URL underneath in `small`. It sits in the bottom-right corner with
 * its right edge and its shadow on the edge of the TV safe area.
 */
export class RoomCodePanel extends GameObjects.Container {
  #code: string;
  #url: string;
  #panel: Rect = { x: 0, y: 0, width: 0, height: 0 };

  constructor(scene: Scene, options: RoomCodeOptions) {
    super(scene, 0, 0);
    this.#code = options.code;
    this.#url = options.url;
    this.#build();
  }

  get code(): string {
    return this.#code;
  }

  get url(): string {
    return this.#url;
  }

  /** The panel's outline box. The shadow sits `metrics.depth` below it. */
  get panelBounds(): Rect {
    return this.#panel;
  }

  setCode(code: string, url: string = this.#url): this {
    if (code === this.#code && url === this.#url) return this;
    this.#code = code;
    this.#url = url;
    return this.#build();
  }

  #build(): this {
    this.removeAll(true);
    const { minWidth, height, padX, gap } = roomCodeMetrics;
    const code = this.scene.make.text({ text: this.#code, style: textStyle("score") }, false);
    const url = this.scene.make.text({ text: this.#url, style: textStyle("small") }, false);
    const width = Math.max(minWidth, Math.ceil(Math.max(code.width, url.width)) + 2 * padX);
    const x = safeArea.right - width;
    const y = safeArea.bottom - metrics.depth - height;
    this.#panel = { x, y, width, height };

    const graphics = this.scene.make.graphics({}, false);
    drawSlab(graphics, this.#panel);

    const textHeight = code.height + gap + url.height;
    const top = Math.round(y + (height - textHeight) / 2);
    const right = x + width - padX;
    code.setOrigin(1, 0).setPosition(right, top);
    url.setOrigin(1, 0).setPosition(right, top + code.height + gap);
    this.add([graphics, code, url]);
    return this;
  }
}
