import { color, pip, players, toPhaserColor } from "@couchcade/theme";
import type { Hex, PlayerShape } from "@couchcade/theme";
import { getScenePalette } from "@couchcade/theme/scenes";

/**
 * Every colour the scene draws with, as Phaser numbers. They all come from `@couchcade/theme`:
 * the core colours, the approved `desert` scene palette, the player colours and the Pip parts.
 */

const desert = getScenePalette("desert").colors;

function sceneColor(index: number, name: string): number {
  const hex = desert[index];
  if (hex === undefined) throw new RangeError(`The desert palette has no ${name} colour`);
  return toPhaserColor(hex);
}

export const palette = {
  ink: toPhaserColor(color.ink),
  chalk: toPhaserColor(color.chalk),
  sunny: toPhaserColor(color.sunny),
  signal: toPhaserColor(color.signal),
  sand: sceneColor(0, "sand"),
  mesa: sceneColor(1, "mesa"),
  sky: sceneColor(2, "sky"),
  cactus: sceneColor(3, "cactus"),
} as const;

/** CSS colours for Phaser text styles. */
export const textColor = {
  ink: color.ink,
  chalk: color.chalk,
  sunny: color.sunny,
} as const satisfies Record<string, Hex>;

export interface SeatLook {
  jersey: number;
  shape: PlayerShape;
}

/** A seat's colour and shape. Slots wrap, so a bad slot never throws mid-match. */
export function seatLook(slot: number): SeatLook {
  const seat = players[((slot % players.length) + players.length) % players.length] ?? players[0];
  return { jersey: toPhaserColor(seat.color), shape: seat.shape };
}

/** Skin and hair colours for a Pip profile, wrapping out-of-range indexes. */
const wrapPick = (list: readonly Hex[], index: number): number =>
  toPhaserColor(list[((index % list.length) + list.length) % list.length] ?? (list[0] as Hex));

export function pipColors(profile: { skin: number; hairColour: number } | undefined): {
  skin: number;
  hair: number;
} {
  return {
    skin: wrapPick(pip.skin, profile?.skin ?? 0),
    hair: wrapPick(pip.hair, profile?.hairColour ?? 0),
  };
}
