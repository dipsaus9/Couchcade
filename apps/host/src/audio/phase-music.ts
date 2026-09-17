/**
 * What plays when the TV's screen changes (docs/architecture/audio.md "What plays when").
 * `playing` isn't handled here: `runtime/stage.ts` fades the lobby loop out precisely when the
 * game's scene starts, which can be a beat after the phase flips (fonts, CC-3.x), not as soon as
 * the screen switches.
 */
import { audio } from "@couchcade/audio";
import type { HostScreen } from "../session/use-host-session.ts";
import { lobbyLoop } from "./platform-sounds.ts";

/** Fades the lobby loop back out of calibration in the same beat it fades in for it (rule of
 * thumb from the doc: "Fades out over 400 ms"). */
const calibrationFadeMs = 400;

export function applyPhaseMusic(name: HostScreen["name"]): void {
  switch (name) {
    case "lobby":
    case "menu":
    case "motion":
      // Lobby loop starts (first time the lobby shows) or simply continues -- `audio.music` on
      // the track that's already playing is a no-op (audio.md "Music loops and crossfades" rule 4).
      audio.music(lobbyLoop);
      return;
    case "calibration":
      audio.music(null, { fadeMs: calibrationFadeMs });
      return;
    case "results":
      audio.play("celebrate");
      audio.music(lobbyLoop);
      return;
    case "passcode":
    case "playing":
      return;
  }
}
