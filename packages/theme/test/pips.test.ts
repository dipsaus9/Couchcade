import { pipParts } from "@couchcade/utils/pips";
import { describe, expect, it } from "vitest";
import {
  pipEyes,
  pipExpressions,
  pipHairBack,
  pipHairColourNames,
  pipHairFront,
  pipHairNames,
  pipHairstyleIds,
  pipHead,
  pipJersey,
  pipJerseyNeck,
  pipMouth,
  pipSkinNames,
  pipViewBox,
  pipViewBoxWidth,
} from "@couchcade/theme";
import { pip } from "@couchcade/theme";

// theme declares no runtime dependencies (packages/theme/package.json), so `pipParts` is a
// test-only import (`@couchcade/utils` is already a devDependency) that checks theme's Pip data
// hasn't drifted from the source of truth (docs/architecture/pips.md "Where each list lives").
describe("Pip data matches @couchcade/utils pipParts", () => {
  it("has the same hairstyle ids, in the same frozen order", () => {
    expect(pipHairstyleIds).toEqual(pipParts.hair);
  });

  it("has a skin tone name and colour for every skin index", () => {
    expect(pipSkinNames.length).toBe(pipParts.skin);
    expect(pip.skin.length).toBe(pipParts.skin);
  });

  it("has a hair colour name and colour for every hairColour index", () => {
    expect(pipHairColourNames.length).toBe(pipParts.hairColour);
    expect(pip.hair.length).toBe(pipParts.hairColour);
  });

  it("has a label for every hairstyle id", () => {
    for (const id of pipParts.hair) expect(pipHairNames[id]).toBeTypeOf("string");
  });
});

describe("Interface Pip geometry", () => {
  it("crops the full Pip and the head at the documented viewBoxes", () => {
    expect(pipViewBox.full).toBe("0 0 100 112");
    expect(pipViewBox.head).toBe("6 4 88 88");
    expect(pipViewBoxWidth.full).toBe(100);
    expect(pipViewBoxWidth.head).toBe(88);
  });

  it("draws the head as a skin-painted circle", () => {
    expect(pipHead.tag).toBe("circle");
    expect(pipHead.paint).toBe("skin");
  });

  it("paints the jersey body with the jersey role and the neck accent with chalk", () => {
    expect(pipJersey.paint).toBe("jersey");
    expect(pipJerseyNeck.paint).toBe("chalk");
  });

  it("gives every hairstyle with a back or front layer a hair-painted part", () => {
    for (const part of [...Object.values(pipHairBack), ...Object.values(pipHairFront)]) {
      expect(part?.paint).toBe("hair");
    }
  });

  it("has no hair layer for bald", () => {
    expect(pipHairBack.bald).toBeUndefined();
    expect(pipHairFront.bald).toBeUndefined();
  });

  it("only assigns back or front layers to known hairstyle ids", () => {
    for (const id of [...Object.keys(pipHairBack), ...Object.keys(pipHairFront)]) {
      expect(pipHairstyleIds).toContain(id);
    }
  });

  it("defines eyes and a mouth for every expression", () => {
    for (const expression of pipExpressions) {
      expect(pipEyes[expression]).toHaveLength(2);
      expect(pipMouth[expression]).toBeDefined();
    }
  });
});
