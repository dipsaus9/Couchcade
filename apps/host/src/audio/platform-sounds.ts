/**
 * The platform's own sounds (docs/architecture/audio.md "Sound tokens and sound banks" and "Music
 * loops and crossfades"): the six house style tokens CC-7.3 sourced into `public/audio/`, and the
 * lobby loop. This is the only file that knows their URLs.
 */
import { audio, defineSounds } from "@couchcade/audio";

const base = import.meta.env.BASE_URL;

/**
 * The six tokens (audio.md's table). Ducking for a token is decided by the engine's own
 * `duckingTokens` list (`your-turn`, `celebrate`, `foul`), not by a `duck` field here, since a
 * token is played by name rather than by `SoundRef`.
 */
export const platformTokens = defineSounds("platform", {
  press: {
    src: `${base}audio/press.ogg`,
    bus: "effects",
    visual: "The button sinks (depth-pressed)",
  },
  ui: {
    src: `${base}audio/ui.ogg`,
    bus: "effects",
    visual: "The element bounces in (ui motion)",
  },
  scene: {
    src: `${base}audio/scene.ogg`,
    bus: "effects",
    visual: "The wipe transition",
  },
  "your-turn": {
    src: `${base}audio/your-turn.ogg`,
    bus: "effects",
    visual: "The active chip lifts 8px with a Sunny outline, squash and stretch",
  },
  celebrate: {
    src: `${base}audio/celebrate.ogg`,
    bus: "effects",
    visual: "A callout pops in with a 4px shake (a fade in reduced motion)",
  },
  foul: {
    src: `${base}audio/foul.ogg`,
    bus: "effects",
    visual: "Horizontal wobble and a FOUL! callout",
  },
});

/**
 * The lobby, menu, motion-check and results music. Not one of the six tokens -- those are all
 * effects -- so it's a separate one-sound bank, played directly by ref with `audio.music`.
 */
const platformMusic = defineSounds("platform", {
  lobbyLoop: {
    src: `${base}audio/lobby-loop.ogg`,
    bus: "music",
    // Sample-accurate loop points (CC-7.7), not `loop: true` over the whole file: the encoded
    // file carries about 0.53s of inert audio past `endS`, so the lossy Vorbis encoder's real
    // quantization artifacts at its own hard start/end land away from the audible seam. See
    // apps/host/CREDITS.md for how startS/endS were measured and verified.
    loop: { startS: 0.030204, endS: 22.178821 },
    visual: "The TV lobby, menu, motion check and results screens",
  },
});

export const lobbyLoop = platformMusic.refs.lobbyLoop;

/**
 * Registers the six tokens and starts fetching every platform sound in the background (audio.md
 * "When files load" rule 1: nothing waits for them). Safe to call before `unlock()` -- fetching
 * doesn't need an `AudioContext`, and decoding runs once one exists. Call once, at boot.
 */
export function registerPlatformSounds(): void {
  audio.setTokens(platformTokens);
  void audio.load(platformTokens);
  void audio.load(platformMusic);
}
