/**
 * The six house style motion tokens, used as sound names (HOUSE_STYLE "Motion, sound and
 * haptics"). The spelling follows HOUSE_STYLE and protocol's `CueToken` (`your-turn`), not
 * theme's `motion` keys (`yourTurn`). No new token without a HOUSE_STYLE change first.
 */
export const soundTokens = ["press", "ui", "scene", "your-turn", "celebrate", "foul"] as const;

export type SoundToken = (typeof soundTokens)[number];

/** Tokens whose sound is a stinger: it ducks the music. `press`, `ui` and `scene` never duck. */
export const duckingTokens: readonly SoundToken[] = ["your-turn", "celebrate", "foul"];
