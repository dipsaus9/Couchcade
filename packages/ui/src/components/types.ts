import type { players } from "@couchcade/theme";

/** Which screen a component is drawn for. Outline, type and label outline sizes follow it. */
export type Screen = "phone" | "tv";

/** A player's id from the theme, in join order: `cherry`, `ocean`, … `teal`. */
export type PlayerId = (typeof players)[number]["id"];

export type ButtonVariant = "primary" | "go" | "stop" | "quiet";

/**
 * - `waiting`: Chalk, nothing to do yet ("Watch the TV")
 * - `dont-tap`: Signal, a tap now is too early ("Wait…")
 * - `act-now`: Turf, tap now ("Tap!")
 * - `hold`: Sunny, press and keep holding ("Hold to aim")
 * - `disabled`: Chalk with an Ink 20% outline and no depth; no input
 */
export type BigActionState = "waiting" | "dont-tap" | "act-now" | "hold" | "disabled";

/** `click` for menus. `pointerdown` during gameplay, so a tap registers the moment it lands. */
export type ButtonTrigger = "click" | "pointerdown";
