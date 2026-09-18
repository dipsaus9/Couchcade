---
id: CC-6.4
title: Build World Pip sprites for Phaser
status: Done
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-18 04:31'
labels:
  - story
dependencies:
  - CC-6.2
  - CC-4.6
references:
  - packages/stage/src/pips/
  - packages/stage/test/pips.test.ts
  - packages/stage/src/index.ts
  - packages/stage/package.json
parent_task_id: CC-6
type: feature
ordinal: 84000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Games can place a player's Pip in a pixel world.

Type: deliverable
Branch: CC-6.4/world-pip-sprites
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 buildWorldPip(profile) produces a 16×24 texture with 1px Ink outline from palette-indexed part data
- [x] #2 Neutral, happy, surprised and sad expressions exist
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
stage/src/pips/index.ts: worldPipSize, PipExpression, WorldPipFace, WorldPipLook types; worldPipGrid (hair behind per style, jersey rows14-22 + chalk chest mark, head circle r5.6, hair-on-top per style incl. curls ring r6.7/cap brim/short fringe, face eyes+mouth per expression incl. blink frame, chin line, 4-neighbour Ink outline) ported directly from pips.md 'World Pip' table; worldPipKey (pip:world:<skin>-<hair>-<hairColour>-<slot>-<expression>-<eyes>); buildWorldPip(scene, look, face) creates+caches a Phaser canvas texture via putImageData, returns the key; worldPipOrigin/drawWorldPipMarker for the anchor + 9x9 seat-shape-under-feet placement (reusing draw/index.ts's drawPlayerShape, not duplicating it). Re-export from stage/src/index.ts; add @couchcade/utils dependency for pipParts.hair. Tests: stage/test/pips.test.ts booting a scene (test/boot.ts), calling buildWorldPip then reading the canvas texture's pixels back directly (getSourceImage + getImageData, the same technique games/target-range/src/host/world.ts already uses) to check the chest mark, jersey colour, outline, each hairstyle's silhouette, and all 4 expressions + blink.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test

References amended: added packages/stage/src/index.ts (barrel re-export, same pattern CC-6.2/CC-6.3 used) and packages/stage/package.json (adds @couchcade/utils as a runtime dependency for pipParts.hair, the hairstyle id order) plus the explicit test path packages/stage/test/pips.test.ts, re-passing the original packages/stage/src/pips/. No game-local world-pip.ts touched: pips.md 'Found while writing this spec' item 5 explicitly assigns that swap to a NEW story after CC-6.4, so games/quick-draw/src/host/world-pip.ts and any Target Range copy are left as-is and reported as a follow-up.

buildWorldPip's signature is (scene, look, face) not (profile) as AC1's shorthand suggests: pips.md's prose says a World Pip is 'built at runtime from the profile and seat', and creating a cached Phaser canvas texture needs a Scene (TextureManager) too - matches the existing games/quick-draw/src/host/world.ts placeholder's own (scene, look, face) shape. AC1 and AC2 are otherwise met as written: buildWorldPip produces a 16x24 canvas texture with a 1px Ink 4-neighbour outline from palette-indexed part data (skin/hairColour/player-colour resolved by index), and all 4 expressions (+ the blink extra frame) exist, tested by reading the canvas texture pixels back directly. pnpm-lock.yaml updated for the new @couchcade/utils runtime dependency (pipParts.hair) added to packages/stage/package.json; excluded from References/reviewer diff per the lockfile rule. pnpm budgets: buildWorldPip isn't wired into any game's host/ yet (that's the new follow-up story from pips.md item 5), so its own cost isn't isolated; host platform JS still passes at 421.76/450 KB.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Built buildWorldPip in packages/stage/src/pips/index.ts: a 16x24 pixel World Pip sprite painted once into a cached Phaser canvas texture (pip:world:<skin>-<hair>-<hairColour>-<slot>-<expression>-<eyes>), palette-indexed from the profile's skin/hair/hairColour and the seat's player colour and shape via theme and @couchcade/utils/pips. Ports every hairstyle's back/top hair layers, all four expressions (neutral/happy/surprised/sad) plus the blink frame, the chest mark, the chin line and the 1px 4-neighbour Ink outline directly from docs/architecture/pips.md's World Pip table. Also adds worldPipOrigin (the (x-8, feetY-24) anchor) and drawWorldPipMarker (the 9x9 seat-shape mark under the feet, reusing draw/index.ts's drawPlayerShape). No game-local world-pip.ts was touched: pips.md item 5 assigns that swap to a new follow-up story. pnpm check, check:deps, test, build and budgets are green.
<!-- SECTION:FINAL_SUMMARY:END -->
