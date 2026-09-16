import { color, world } from "@couchcade/theme";
import { AUTO, Game, Scale, Scene } from "phaser";
import { integerZoom } from "./zoom.ts";

/** An empty world. CC-1.15 starts game scenes on this stage. */
class IdleScene extends Scene {
  constructor() {
    super("idle");
  }
}

/**
 * Boots Phaser at the 480×270 world size with nearest-neighbour pixels and the largest integer
 * zoom that fits the window, recomputed on resize (HOUSE_STYLE "Game worlds").
 */
export function bootStage(parent: HTMLElement): Game {
  const game = new Game({
    type: AUTO,
    parent,
    width: world.width,
    height: world.height,
    backgroundColor: color.sky,
    pixelArt: true,
    banner: false,
    // Sound arrives with CC-7.2.
    audio: { noAudio: true },
    scale: {
      mode: Scale.NONE,
      autoCenter: Scale.CENTER_BOTH,
      zoom: integerZoom(window.innerWidth, window.innerHeight),
    },
    scene: [IdleScene],
  });

  const fit = () => game.scale.setZoom(integerZoom(window.innerWidth, window.innerHeight));
  window.addEventListener("resize", fit);
  game.events.once("destroy", () => window.removeEventListener("resize", fit));
  return game;
}
