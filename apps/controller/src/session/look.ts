import { players, type PlayerShape } from "@couchcade/theme";

/** How a seated player looks: colour and shape come from the seat (docs/HOUSE_STYLE.md, "Player colours"). */
export interface PlayerLook {
  /** Colour name, for example "Cherry". */
  colourName: string;
  shape: PlayerShape;
  /** The theme's CSS variable for the colour. */
  fill: string;
  /** "Player 1" to "Player 8". */
  seatLabel: string;
}

/** The look for seat `slot` (0 to 7), or null for audience, who have no colour or shape. */
export function lookForSlot(slot: number | null): PlayerLook | null {
  const player = slot === null ? undefined : players[slot];
  if (slot === null || !player) return null;
  return {
    colourName: player.id.charAt(0).toUpperCase() + player.id.slice(1),
    shape: player.shape,
    fill: `var(--cc-player-${player.id})`,
    seatLabel: `Player ${slot + 1}`,
  };
}
