/**
 * `@couchcade/audio`: sound on the TV (docs/architecture/audio.md). Platform moments play the six
 * house style tokens; a game declares its sounds once in `src/host/sounds.ts` with `defineSounds`
 * and plays them by ref. Never import this from a phone: apps/controller and games' `src/controller/`.
 *
 * ```ts
 * audio.unlock();                            // first line of a click or keydown handler
 * audio.play("celebrate");                   // a token, ducks the music
 * audio.play(quickDrawSounds.refs.drawSting);
 * audio.music(lobbyLoop);                    // 800 ms crossfade
 * const release = audio.duck();              // music at 50% until release()
 * ```
 */
import { createAudio } from "./engine.ts";
import type { Audio } from "./engine.ts";

export { soundTokens } from "./tokens.ts";
export type { SoundToken } from "./tokens.ts";
export { defineSounds } from "./bank.ts";
export type { SoundBank, SoundDef, SoundRef } from "./bank.ts";
export { audioLimits, createAudio, defaultVolumes, stepGain } from "./engine.ts";
export type { Audio, AudioOptions, AudioState, SoundHandle, Volumes } from "./engine.ts";
export type * from "./context.ts";

/**
 * The page's shared instance: the TV has one speaker. Creating it doesn't touch the audio
 * hardware; the `AudioContext` only exists after `unlock()`.
 */
export const audio: Audio = createAudio();
