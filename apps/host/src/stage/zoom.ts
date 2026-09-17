/** The largest canvas the TV renders, in device pixels: 4K. Bigger screens are scaled up by CSS. */
export const maxCanvasPixels = 3840 * 2160;

/** The canvas size for a window, in device pixels, and the CSS zoom that shows it at window size. */
export interface CanvasSize {
  width: number;
  height: number;
  /** CSS pixels per canvas pixel, Phaser's Scale Manager `zoom`: `1 / devicePixelRatio` or more. */
  zoom: number;
}

/**
 * The Phaser canvas covers the window at the screen's own resolution: 1920×1080 on a 1080p TV, the
 * window times `devicePixelRatio` on a HiDPI laptop. Above 4K it renders at 4K and CSS scales it
 * up, which keeps the frame cheap on big screens. The stage fits the 480×270 world into it at a
 * whole-number zoom and draws text at this resolution (docs/architecture/platform.md, "TV rendering").
 */
export function canvasSize(
  viewportWidth: number,
  viewportHeight: number,
  devicePixelRatio: number,
): CanvasSize {
  const cssWidth = Math.max(1, viewportWidth);
  const cssHeight = Math.max(1, viewportHeight);
  const cap = Math.sqrt(maxCanvasPixels / (cssWidth * cssHeight));
  const scale = Math.min(Math.max(devicePixelRatio, 1), cap);
  const width = Math.round(cssWidth * scale);
  const height = Math.round(cssHeight * scale);
  return { width, height, zoom: cssWidth / width };
}
