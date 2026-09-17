import type { HostSceneData } from "@couchcade/game-sdk/contract";
import { world } from "@couchcade/theme";
import { GameObjects, Scale, Scene, Scenes } from "phaser";
import type { Cameras, Game, Types } from "phaser";
import { Callout } from "../callout/index.ts";
import type { CalloutOptions } from "../callout/index.ts";
import { OVERLAY_DEPTH, overlayFrame, stageViewport } from "../layout/index.ts";
import type { StageViewport } from "../layout/index.ts";
import { RoomCodePanel } from "../room-code/index.ts";
import type { RoomCodeOptions } from "../room-code/index.ts";
import { Scoreboard } from "../scoreboard/index.ts";
import type { ScoreboardOptions } from "../scoreboard/index.ts";

/**
 * The base class for every game's TV scene. It owns the overlay layer, which draws above the
 * game world, and puts the house style overlays on it: games never draw their own interface
 * (HOUSE_STYLE "How the style is enforced").
 *
 * The scene renders through two cameras over the same centred 16:9 box of the canvas
 * (docs/architecture/platform.md, "TV rendering"):
 *
 * - `cameras.main`, the world camera: the game's 480×270 world at the largest whole-number zoom,
 *   nearest-neighbour, so every world pixel stays square.
 * - `overlayCamera`: only the overlay layer, laid out in 1920×1080 overlay pixels and zoomed to
 *   the canvas (×1 on a 1920×1080 canvas), so text and panels draw at the screen's resolution.
 *
 * ```ts
 * export default class QuickDrawScene extends StageScene<QuickDrawState> {
 *   constructor() { super("quick-draw"); }
 *   create() {
 *     this.add.image(240, 135, "desert");             // the world, in world pixels
 *     this.addScoreboard({ players: this.hostData!.players });
 *     this.addCallout("Draw!", { holdMs: 600 });     // on the overlay, in overlay pixels
 *   }
 * }
 * ```
 */
export class StageScene<TState = unknown> extends Scene {
  #overlay: GameObjects.Layer | null = null;
  #overlayCamera: Cameras.Scene2D.Camera | null = null;
  #viewport: StageViewport = stageViewport(overlayFrame.width, overlayFrame.height);

  constructor(config?: string | Types.Scenes.SettingsConfig) {
    super(config);
    // Subclasses replace init() and create() without calling super, so the cameras are set up
    // from the START event, which fires on every (re)start before the scene's own init(). A
    // scene's event emitter only exists once the scene manager has called Systems#init (marked
    // protected in Phaser's types), so that call is wrapped to subscribe right after it.
    const systems = this.sys as unknown as { init(game: Game): void };
    const boot = systems.init.bind(this.sys);
    systems.init = (game: Game) => {
      boot(game);
      this.sys.events.on(Scenes.Events.START, () => this.#setUpCameras());
    };
  }

  /**
   * The overlay layer. Created on first use. Only the overlay camera draws it, so it is always
   * above the world whatever its position in the display list.
   */
  get overlay(): GameObjects.Layer {
    if (!this.#overlay) {
      const layer = this.add.layer().setName("stage-overlay").setDepth(OVERLAY_DEPTH);
      this.#overlay = layer;
      // A restarted scene gets a fresh display list, and so a fresh overlay.
      this.events.once(Scenes.Events.SHUTDOWN, () => {
        if (this.#overlay === layer) this.#overlay = null;
      });
    }
    return this.#overlay;
  }

  /** The camera that draws the overlay layer in overlay pixels. Null before the scene starts. */
  get overlayCamera(): Cameras.Scene2D.Camera | null {
    return this.#overlayCamera;
  }

  /** Where the world and the overlay sit on the canvas, and at what zoom. */
  get viewport(): StageViewport {
    return this.#viewport;
  }

  /** What the host runtime started the scene with, or undefined when started without it. */
  get hostData(): HostSceneData<TState> | undefined {
    const data = this.sys.settings.data as Partial<HostSceneData<TState>> | undefined;
    return typeof data?.getState === "function" ? (data as HostSceneData<TState>) : undefined;
  }

  /** The host's reduced motion setting. Overlays read it when they animate. */
  get reducedMotion(): boolean {
    return this.hostData?.reducedMotion ?? false;
  }

  /** Adds the scoreboard to the overlay, across the top of the safe area. */
  addScoreboard(options: ScoreboardOptions): Scoreboard {
    const scoreboard = new Scoreboard(this, options);
    this.overlay.add(scoreboard);
    return scoreboard;
  }

  /** Adds a callout to the overlay and plays its entrance, honouring reduced motion. */
  addCallout(text: string, options: CalloutOptions = {}): Callout {
    const callout = new Callout(this, text, { reducedMotion: this.reducedMotion, ...options });
    this.overlay.add(callout);
    return callout.play();
  }

  /** Adds the room code panel to the overlay, in the bottom-right corner of the safe area. */
  addRoomCode(options: RoomCodeOptions): RoomCodePanel {
    const panel = new RoomCodePanel(this, options);
    this.overlay.add(panel);
    return panel;
  }

  #setUpCameras(): void {
    this.cameras.main.setName("stage-world");
    const overlayCamera = this.cameras.add(0, 0, 1, 1, false, "stage-overlay");
    overlayCamera.setRoundPixels(true);
    this.#overlayCamera = overlayCamera;
    this.#fit();

    const fit = () => this.#fit();
    const assign = () => this.#assignCameras();
    this.scale.on(Scale.Events.RESIZE, fit);
    this.events.on(Scenes.Events.PRE_RENDER, assign);
    this.events.once(Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Scale.Events.RESIZE, fit);
      this.events.off(Scenes.Events.PRE_RENDER, assign);
      this.#overlayCamera = null;
    });
  }

  /** Fits both cameras to the canvas: whole-number world zoom, the overlay zoomed to match. */
  #fit(): void {
    const overlayCamera = this.#overlayCamera;
    if (!overlayCamera) return;
    const viewport = stageViewport(this.scale.width, this.scale.height);
    this.#viewport = viewport;
    const { x, y, width, height } = viewport;
    this.cameras.main
      .setViewport(x, y, width, height)
      .setZoom(viewport.worldZoom)
      .centerOn(world.width / 2, world.height / 2);
    overlayCamera
      .setViewport(x, y, width, height)
      .setZoom(viewport.overlayZoom)
      .centerOn(overlayFrame.width / 2, overlayFrame.height / 2);
  }

  /**
   * Runs before every render: the world camera skips the overlay layer, the overlay camera skips
   * everything else, and overlay text is drawn 1:1 on the canvas (see `sharpenText`).
   */
  #assignCameras(): void {
    const overlayCamera = this.#overlayCamera;
    if (!overlayCamera) return;
    const worldCamera = this.cameras.main;
    const overlay = this.#overlay;
    for (const child of this.children.list) {
      if (child === overlay) {
        child.cameraFilter = (child.cameraFilter & ~overlayCamera.id) | worldCamera.id;
      } else {
        child.cameraFilter |= overlayCamera.id;
      }
    }
    if (!overlay) return;
    const visit = (children: readonly GameObjects.GameObject[], upright: boolean) => {
      for (const child of children) {
        child.cameraFilter &= ~overlayCamera.id;
        if (child instanceof GameObjects.Text) {
          sharpenText(child, overlayCamera.zoom, upright && isUpright(child));
        } else if (child instanceof GameObjects.Container) {
          visit(child.list, upright && isUpright(child));
        }
      }
    };
    visit(overlay.list, true);
  }
}

/** Not rotated, scaled or flipped, so a text's texture can map 1:1 onto canvas pixels. */
function isUpright(object: GameObjects.Text | GameObjects.Container): boolean {
  return object.rotation === 0 && object.scaleX === 1 && object.scaleY === 1;
}

/** What `sharpenText` last did to a text: the padding it added and the size it left. */
interface Sharpened {
  text: string;
  zoom: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
}

const sharpened = new WeakMap<GameObjects.Text, Sharpened>();

/**
 * Makes overlay text sharp at any overlay zoom (docs/architecture/platform.md, "TV rendering"):
 *
 * - Its glyphs rasterise at exactly the overlay zoom, below ×1 too. On a 1920×970 canvas (a 1080p
 *   TV in a browser window) the overlay is ×0.75, and 1080p glyphs shrunk by nearest-neighbour
 *   sampling would lose and double strokes.
 * - Upright text snaps to whole canvas pixels. Phaser only rounds an unscaled object under an
 *   unzoomed camera, so at ×0.75 or ×1.5 text would otherwise land between pixels.
 * - Its texture is a whole number of canvas pixels wide and high, so a snapped text is never
 *   stretched by a pixel: the right and bottom padding grow by less than one canvas pixel.
 *
 * Rotated or scaling text, such as a callout, keeps Phaser's default rounding. Runs every frame,
 * and only re-renders a text when its content, size or the zoom changed.
 */
export function sharpenText(text: GameObjects.Text, zoom: number, upright: boolean): void {
  text.setVertexRoundMode(upright ? "full" : "safeAuto");
  const { padding, style } = text;
  const last = sharpened.get(text);
  if (
    last?.zoom === zoom &&
    last.text === text.text &&
    last.width === text.width &&
    last.height === text.height &&
    style.resolution === zoom
  ) {
    return;
  }
  if (style.fixedWidth !== 0 || style.fixedHeight !== 0) {
    text.setResolution(zoom);
    return;
  }
  // Measured the way Phaser's updateText does, so the sums below match its own to the bit.
  const lines =
    style.wordWrapWidth || style.wordWrapCallback
      ? text.getWrappedText()
      : text.text.split(text.splitRegExp as RegExp);
  const content = GameObjects.GetTextSize(text, style.getTextMetrics(), lines);
  const left = padding.left ?? 0;
  const top = padding.top ?? 0;
  const right = (padding.right ?? 0) - (last?.right ?? 0);
  const bottom = (padding.bottom ?? 0) - (last?.bottom ?? 0);
  const extraRight = topUp(content.width, left, right, zoom);
  const extraBottom = topUp(content.height, top, bottom, zoom);
  style.resolution = zoom;
  text.setPadding({ left, top, right: right + extraRight, bottom: bottom + extraBottom });
  sharpened.set(text, {
    text: text.text,
    zoom,
    width: text.width,
    height: text.height,
    right: extraRight,
    bottom: extraBottom,
  });
}

/**
 * The extra end padding that makes one side of a text a whole number of canvas pixels, summed the
 * way Phaser sizes the text canvas: `(content + start + end) × zoom`. The size must not end a hair
 * under the whole number (the canvas would drop a pixel) or over it (snapping could add one).
 */
function topUp(content: number, start: number, end: number, zoom: number): number {
  const size = (extra: number) => (content + start + (end + extra)) * zoom;
  const pixels = Math.ceil(size(0) - 1e-6);
  let extra = pixels / zoom - (content + start + end);
  for (let step = 0; step < 16 && size(extra) !== pixels; step++) {
    extra += (size(extra) < pixels ? 1 : -1) * 1e-13;
  }
  return size(extra) < pixels ? extra + 1e-9 : extra;
}
