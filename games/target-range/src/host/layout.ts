import { world } from "@couchcade/theme";
import { SHAPE_SIZE } from "@couchcade/stage/draw";
import type { Box } from "./label-layout.ts";
import type { Point } from "../shared/index.ts";

/**
 * Where things sit in the 480×270 world (docs/games/target-range.md, "TV scene"). Every value is a
 * whole world pixel, so the stage's integer zoom keeps each pixel square. The stage scoreboard
 * takes the top of the TV safe area (down to y = 36) and the instruction and room code panels
 * the bottom (from y = 218), so the range lives between them.
 */

/** The far end of the range: sky above, hedge and grass below. */
export const horizonY = 80;

/** The lowest world row the scoreboard covers (its shadow ends at 144 overlay px). */
export const scoreboardBottomY = 36;
/** The highest world row the bottom panels cover (they start at 872 overlay px). */
export const panelTopY = 218;

/** Where a Pip stands. `facing` is 1 for looking right (the left corner), -1 for the right. */
export interface PipSlot {
  x: number;
  /** Y of the Pip's feet. */
  feetY: number;
  facing: 1 | -1;
}

/** Pip feet sit here, so the shape marker under them ends above the bottom panel. */
export const pipFeetY = 206;
/** Pip centres in the left corner, from the middle outwards. The right corner mirrors them. */
const cornerXs = [104, 80, 56, 32] as const;

/**
 * Pip positions by seat order: even seats in the front left corner and odd seats in the front
 * right corner, the first ones nearest the middle, so the middle stays clear for arrows.
 */
export function pipSlots(count: number): PipSlot[] {
  return Array.from({ length: count }, (_, index) => {
    const left = index % 2 === 0;
    const x = cornerXs[Math.floor(index / 2) % cornerXs.length] as number;
    return { x: left ? x : world.width - x, feetY: pipFeetY, facing: left ? 1 : -1 };
  });
}

/** The bow's middle, where an arrow leaves, for a Pip in `slot` with the bow up or down. */
export function bowPoint(slot: PipSlot, raised: boolean): Point {
  return { x: slot.x + 9 * slot.facing, y: slot.feetY - (raised ? 15 : 9) };
}

/** Straw around the target face, in world px. */
export const bossMarginPx = 4;
/** The stand's legs below the straw boss. */
export const legPx = 12;

/** How far the wind flag's pole stands from the target face's edge. */
const flagGapPx = 16;
/** The flag pole's height above the ground. */
export const poleHeightPx = 30;

/**
 * The flag stands on the ground next to the target, on the side facing the middle of the range,
 * so it never leaves the world. Returns the foot of the pole.
 */
export function flagFoot(target: Point, radius: number): Point {
  const side = target.x > world.width / 2 ? -1 : 1;
  return {
    x: Math.round(target.x + side * (radius + bossMarginPx + flagGapPx)),
    y: Math.round(target.y + radius + bossMarginPx + legPx),
  };
}

/** The TV safe area's left and right inset in world px (96 overlay px). */
const safeInsetPx = 24;
/** Half of BULLSEYE! at the callout size, in world px (about 800 overlay px wide). */
const calloutHalfWidthPx = 100;
/** BULLSEYE! sits just in front of the hedge, below the points tags under the scoreboard. */
const calloutY = 100;

/**
 * Where BULLSEYE! is centred: over the wider stretch of range beside the target, so it covers as
 * little of the face and its arrows as it can while everyone looks for their arrow.
 */
export function calloutAt(target: Point, radius: number): Point {
  const faceLeft = target.x - radius - bossMarginPx;
  const faceRight = target.x + radius + bossMarginPx;
  const leftRoom = faceLeft - safeInsetPx;
  const rightRoom = world.width - safeInsetPx - faceRight;
  const min = safeInsetPx + calloutHalfWidthPx;
  const max = world.width - safeInsetPx - calloutHalfWidthPx;
  const x =
    leftRoom >= rightRoom
      ? Math.max(min, Math.round((safeInsetPx + faceLeft) / 2))
      : Math.min(max, Math.round((faceRight + world.width - safeInsetPx) / 2));
  return { x, y: calloutY };
}

/** The crosshair ring's size (docs/games/target-range.md, "Readability with 8 crosshairs"). */
export const crosshairSize = 15;
export const crosshairCentre = Math.floor(crosshairSize / 2);

/** Where a crosshair's shape goes: touching the ring at its top right. */
export function crosshairShapeBox(crosshair: { x: number; y: number }): Box {
  const left = crosshair.x + 5;
  const top = crosshair.y - 5 - SHAPE_SIZE + 1;
  return { left, top, right: left + SHAPE_SIZE, bottom: top + SHAPE_SIZE };
}

/** A crosshair ring's box. */
export function crosshairBox(crosshair: { x: number; y: number }): Box {
  const left = crosshair.x - crosshairCentre;
  const top = crosshair.y - crosshairCentre;
  return { left, top, right: left + crosshairSize, bottom: top + crosshairSize };
}

/** The part of the world arrow shapes may use: below the scoreboard and above the panels. */
export const shapeBounds: Box = {
  left: 0,
  top: scoreboardBottomY,
  right: world.width,
  bottom: panelTopY,
};
