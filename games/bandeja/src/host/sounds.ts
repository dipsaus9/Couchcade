/**
 * Bandeja's sound bank (docs/architecture/audio.md "Game sound banks", "Wiring the existing
 * games"): every `.ogg`/`.mp3` in `assets/sounds/` and how a cue plays it. This is the only file
 * that knows their URLs -- `cues.ts` only describes moments, never sounds.
 *
 * `playCueSound` is what `scene.ts` subscribes to `bandejaCueEvent` with.
 */
import { audio, defineSounds } from "@couchcade/audio";
import gameMusicLoop from "../../assets/sounds/game-music-loop.ogg?url";
import glassPing from "../../assets/sounds/glass-ping.ogg?url";
import matchEnd from "../../assets/sounds/match-end.ogg?url";
import meshRattle1 from "../../assets/sounds/mesh-rattle-1.ogg?url";
import meshRattle2 from "../../assets/sounds/mesh-rattle-2.ogg?url";
import meshRattle3 from "../../assets/sounds/mesh-rattle-3.ogg?url";
import meshRattle4 from "../../assets/sounds/mesh-rattle-4.ogg?url";
import meshRattle5 from "../../assets/sounds/mesh-rattle-5.ogg?url";
import netFlub from "../../assets/sounds/net-flub.mp3?url";
import pointDing from "../../assets/sounds/point-ding.ogg?url";
import racketPock1 from "../../assets/sounds/racket-pock-1.ogg?url";
import racketPock2 from "../../assets/sounds/racket-pock-2.ogg?url";
import racketPock3 from "../../assets/sounds/racket-pock-3.ogg?url";
import racketPock4 from "../../assets/sounds/racket-pock-4.ogg?url";
import racketPock5 from "../../assets/sounds/racket-pock-5.ogg?url";
import type { BandejaCue } from "./cues.ts";

export const bandejaSounds = defineSounds("bandeja", {
  gameMusicLoop: { src: gameMusicLoop, bus: "music", visual: "The court, evening sky" },
  racketPock1: { src: racketPock1, bus: "effects", visual: "The racket swings on a connect" },
  racketPock2: { src: racketPock2, bus: "effects", visual: "The racket swings on a connect" },
  racketPock3: { src: racketPock3, bus: "effects", visual: "The racket swings on a connect" },
  racketPock4: { src: racketPock4, bus: "effects", visual: "The racket swings on a connect" },
  racketPock5: { src: racketPock5, bus: "effects", visual: "The racket swings on a connect" },
  glassPing: { src: glassPing, bus: "effects", visual: "The far or corner glass flashes" },
  meshRattle1: { src: meshRattle1, bus: "effects", visual: "The side mesh flashes" },
  meshRattle2: { src: meshRattle2, bus: "effects", visual: "The side mesh flashes" },
  meshRattle3: { src: meshRattle3, bus: "effects", visual: "The side mesh flashes" },
  meshRattle4: { src: meshRattle4, bus: "effects", visual: "The side mesh flashes" },
  meshRattle5: { src: meshRattle5, bus: "effects", visual: "The side mesh flashes" },
  netFlub: { src: netFlub, bus: "effects", visual: "NET! over the court" },
  pointDing: { src: pointDing, bus: "effects", visual: "POINT!/WINNER! over the court" },
  matchEnd: { src: matchEnd, bus: "effects", visual: "MATCH! over the court" },
});

const racketPocks = [
  bandejaSounds.refs.racketPock1,
  bandejaSounds.refs.racketPock2,
  bandejaSounds.refs.racketPock3,
  bandejaSounds.refs.racketPock4,
  bandejaSounds.refs.racketPock5,
] as const;
const meshRattles = [
  bandejaSounds.refs.meshRattle1,
  bandejaSounds.refs.meshRattle2,
  bandejaSounds.refs.meshRattle3,
  bandejaSounds.refs.meshRattle4,
  bandejaSounds.refs.meshRattle5,
] as const;

/** Cycles through a bank's variants so five identical shots don't sound identical in a row. */
function cycle<T>(variants: readonly T[]): () => T {
  let index = 0;
  return () => {
    const value = variants[index % variants.length] as T;
    index += 1;
    return value;
  };
}
const nextRacketPock = cycle(racketPocks);
const nextMeshRattle = cycle(meshRattles);

/**
 * Turns one Bandeja cue into `@couchcade/audio` calls (docs/games/bandeja.md, "TV scene",
 * "Sound"). Two cues have no CC0 sample yet, both flagged in `CREDITS.md` under "Not included in
 * this story": the floor-bounce turf thud (`impactSoft_medium`, unrecoverable this session) and a
 * distinct serve sound (not in the spec's own shortlist -- a serve is a swing, the same racket
 * pock as any other hit). `bounce` and `serve` therefore intentionally play nothing; every visual
 * they mark (the shadow meeting the floor, the ball leaving the racket) still shows without sound.
 */
export function playCueSound(cue: BandejaCue): void {
  switch (cue.type) {
    case "match":
      audio.music(bandejaSounds.refs.gameMusicLoop);
      return;
    case "serve":
    case "bounce":
      return;
    case "hit":
      audio.play(nextRacketPock());
      return;
    case "wall":
      audio.play(cue.surface === "glass" ? bandejaSounds.refs.glassPing : nextMeshRattle());
      return;
    case "net":
      audio.play(bandejaSounds.refs.netFlub);
      return;
    case "point":
      audio.play(bandejaSounds.refs.pointDing);
      audio.play("celebrate");
      return;
    case "matchEnd":
      audio.play(bandejaSounds.refs.matchEnd);
      return;
  }
}
