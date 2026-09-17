import { color } from "@couchcade/theme";
import { AUTO, Game, Scale, Scene } from "phaser";
import { canvasSize } from "./zoom.ts";

/** An empty world. CC-1.15 starts game scenes on this stage. */
class IdleScene extends Scene {
  constructor() {
    super("idle");
  }
}

const currentSize = () =>
  canvasSize(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1);

/**
 * Boots Phaser on a canvas at the screen's resolution (1920×1080 on a 1080p TV, capped at 4K) with
 * nearest-neighbour pixels, refitted when the window or its pixel ratio changes. Game scenes
 * extend `StageScene` from `@couchcade/stage`, which draws the 480×270 world at a whole-number
 * zoom and the overlays and text at the canvas resolution (docs/architecture/platform.md, "TV
 * rendering").
 */
export function bootStage(parent: HTMLElement): Game {
  const size = currentSize();
  const game = new Game({
    type: AUTO,
    parent,
    width: size.width,
    height: size.height,
    backgroundColor: color.sky,
    pixelArt: true,
    banner: false,
    // Sound arrives with CC-7.2.
    audio: { noAudio: true },
    scale: { mode: Scale.NONE, autoCenter: Scale.CENTER_BOTH, zoom: size.zoom },
    scene: [IdleScene],
  });

  let ratio: MediaQueryList | null = null;
  const fit = () => {
    const next = currentSize();
    if (next.width !== game.scale.width || next.height !== game.scale.height) {
      game.scale.resize(next.width, next.height);
    }
    game.scale.setZoom(next.zoom);
    watchRatio();
  };
  // Moving the window to a screen with another pixel ratio doesn't always fire `resize`.
  const watchRatio = () => {
    ratio?.removeEventListener("change", fit);
    ratio = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    ratio.addEventListener("change", fit);
  };
  watchRatio();
  window.addEventListener("resize", fit);
  game.events.once("destroy", () => {
    window.removeEventListener("resize", fit);
    ratio?.removeEventListener("change", fit);
  });
  return game;
}
