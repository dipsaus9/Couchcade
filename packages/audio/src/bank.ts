/**
 * Sound banks: the sounds one owner (the platform or one game) declares once and plays by ref.
 * A game's `src/host/sounds.ts` is the only place a sound URL appears.
 */

/** One sound file and how it plays. */
export interface SoundDef {
  /** URL from a Vite `?url` import or the app's public folder. */
  src: string;
  bus: "effects" | "music";
  /**
   * What the TV shows at the same moment. Required: every sound has a visual counterpart
   * (HOUSE_STYLE), and reviews and tests read it.
   */
  visual: string;
  /** 0 to 1, default 1, to level a loud file. */
  gain?: number;
  /** Effects only: this sound is a stinger and ducks the music while it plays. */
  duck?: boolean;
  /** Loops the whole buffer, or between `startS` and `endS` (music, or a looping effect like wind). */
  loop?: true | { startS: number; endS: number };
}

/** A typed handle to one sound in a bank, such as `quickDrawSounds.refs.drawSting`. */
export interface SoundRef {
  /** The bank owner: "platform" or the game id. */
  readonly owner: string;
  /** The sound id inside the bank, camelCase. */
  readonly id: string;
  readonly def: Readonly<SoundDef>;
}

export interface SoundBank<K extends string> {
  readonly owner: string;
  readonly refs: { readonly [Id in K]: SoundRef };
}

/** Declares a bank. `owner` is "platform" or the game id, so two games' `wind` never collide. */
export function defineSounds<const K extends string>(
  owner: string,
  defs: Record<K, SoundDef>,
): SoundBank<K> {
  const refs = {} as Record<K, SoundRef>;
  for (const id of Object.keys(defs) as K[]) {
    refs[id] = Object.freeze({ owner, id, def: Object.freeze({ ...defs[id] }) });
  }
  return Object.freeze({ owner, refs: Object.freeze(refs) });
}
