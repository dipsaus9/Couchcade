import { motion } from "@couchcade/theme";
import { cueTokens } from "@couchcade/protocol";
import { describe, expect, it } from "vitest";
import * as audio from "../src/index.ts";
import { defineSounds, soundTokens } from "../src/index.ts";
import type { SoundDef, SoundToken } from "../src/index.ts";
import pkg from "../package.json" with { type: "json" };

const kebab = (key: string) => key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

describe("package", () => {
  it("exports the audio API from one entry", () => {
    expect(pkg.exports).toEqual({ ".": "./src/index.ts" });
    expect(Object.keys(audio).toSorted()).toEqual([
      "audio",
      "audioLimits",
      "createAudio",
      "defaultVolumes",
      "defineSounds",
      "soundTokens",
      "stepGain",
    ]);
  });

  it("has no runtime dependencies", () => {
    expect(pkg).not.toHaveProperty("dependencies");
    expect(pkg).not.toHaveProperty("peerDependencies");
  });

  it("uses the owner's default volumes: music 60%, effects 80%, not muted", () => {
    expect(audio.defaultVolumes).toEqual({ muted: false, music: 6, effects: 8 });
  });
});

describe("sound tokens", () => {
  it("has exactly one sound token per theme motion key", () => {
    expect(Object.keys(motion).map(kebab).toSorted()).toEqual([...soundTokens].toSorted());
  });

  it("spells tokens like protocol's CueToken", () => {
    const cues: readonly SoundToken[] = cueTokens;
    for (const cue of cues) expect(soundTokens).toContain(cue);
  });
});

describe("defineSounds", () => {
  it("gives one typed ref per sound, carrying its owner, id and def", () => {
    const bank = defineSounds("quick-draw", {
      drawSting: { src: "/draw.ogg", bus: "effects", duck: true, visual: "DRAW! callout" },
    });
    expect(bank.owner).toBe("quick-draw");
    expect(bank.refs.drawSting).toEqual({
      owner: "quick-draw",
      id: "drawSting",
      def: { src: "/draw.ogg", bus: "effects", duck: true, visual: "DRAW! callout" },
    });
    expect(Object.isFrozen(bank.refs.drawSting.def)).toBe(true);
    // @ts-expect-error: a bank only has the refs it declared.
    expect(bank.refs.wind).toBeUndefined();
  });

  it("requires every sound to name its visual", () => {
    // @ts-expect-error: `visual` is required, so every sound has a visual counterpart.
    const missing: SoundDef = { src: "/pop.ogg", bus: "effects" };
    defineSounds("platform", {
      // @ts-expect-error: the same inside defineSounds.
      pop: { src: "/pop.ogg", bus: "effects" },
    });
    expect(missing.visual).toBeUndefined();
  });
});
