---
id: CC-4.2
title: >-
  Build the theme package: tokens, CSS variables, Phaser colours and contrast
  tests
status: Done
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 16:06'
labels:
  - story
dependencies:
  - CC-1.5
references:
  - packages/theme/package.json
  - packages/theme/src/tokens.ts
  - packages/theme/src/generate/
  - packages/theme/src/scenes/
  - packages/theme/test/
parent_task_id: CC-4
type: feature
ordinal: 62000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
One source of truth for colours, type, shape and motion tokens.

Type: deliverable
Branch: CC-4.2/theme-package
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 packages/theme exports the tokens from HOUSE_STYLE.md
- [x] #2 toCssVars() and toPhaserColor() are generated and snapshot-tested
- [x] #3 Scene palettes auto-register from packages/theme/src/scenes/*.ts (desert, alley and track included)
- [x] #4 Every text/background pair passes WCAG AA in a test
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Scaffold packages/theme (package.json with . and ./* exports, tsconfig with vite/client types for import.meta.glob, vitest.config.ts, src/index.ts).
2. src/tokens.ts: core colours, approved ink tints (ink-20 on Chalk and on Sky, ink-45, ink-70), players, Pip skin/hair, fonts, type scale, shape, motion, world, and the declared text/background pairs.
3. src/generate/index.ts: toCssVars(tokens) and toPhaserColor(hex) (+ toPhaserColors); snapshot tests.
4. src/scenes/<game-id>.ts for quick-draw (desert), strike-night (alley), pixel-derby (track) with HOUSE_STYLE colours; src/scenes/index.ts registers them with import.meta.glob and validates ids and the 16-colour cap.
5. test/: exports, tokens vs HOUSE_STYLE, generators (snapshots), scenes registry, WCAG AA contrast over every declared pair (ink-45 exempt as disabled-only).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test

Delivery notes (CC-4.2):
- Scene palettes: HOUSE_STYLE defines desert, alley and track, so the values are taken verbatim. Files follow platform.md (packages/theme/src/scenes/<game-id>.ts exporting the scene id): quick-draw.ts (desert), strike-night.ts (alley), pixel-derby.ts (track). CC-10.5, CC-12.5 and CC-20.5 own those files next and only need to review/extend them.
- The glob registry is exported at @couchcade/theme/scenes, not from the root, because import.meta.glob only works under Vite/Vitest; the root export stays importable from plain TypeScript tooling. ScenePaletteId is a string type (a glob can't produce a literal union); getScenePalette() throws on unknown ids.
- Contrast, measured: ink/chalk 13.76, ink/sky 8.61, ink/sunny 9.14, ink70/chalk 5.34 (ink70/sky 3.34, so ink-70 is declared on Chalk only), chalk/ink 13.76, sunny/ink 9.14, ink/turf 5.22, ink/signal 4.00, ink45/chalk 2.61.
- Chalk on Turf is 2.64:1 and Chalk on Signal 3.44:1 without their Ink treatment. The declared pairs carry halo: ink; the test checks text vs halo at 4.5:1 (WCAG 1.4.3: a wide outline counts as background) and halo vs background at 3:1 (narrow outline counts as the letter; haloed text is action size or larger). This only holds if the Ink treatment is an outline around the letters, not only the downward shadow HOUSE_STYLE describes: raised to the owner.
- ink-45 on Chalk is the single exempt pair (disabled: true): WCAG 1.4.3 sets no contrast requirement for inactive UI components, and the owner approved ink-45 for disabled text only.
- Approved ink-70 is #60697F; an exact 70% mix gives #606980. The tint test allows one step per channel and the approved value is kept.
- Implied package scaffolding outside the file-level References: packages/theme/src/index.ts, tsconfig.json, vitest.config.ts, plus pnpm-lock.yaml.

Review round 1 (dipsaus-ai:story-reviewer): pass. All 4 criteria met, no scope violations. Advisories: cite WCAG 1.4.11 for the 3:1 halo-edge check (applied); documentedTokens() evaluates the HOUSE_STYLE tokens.ts block with new Function (test-only, kept).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added @couchcade/theme (tier 1, exports . and ./*). src/tokens.ts holds the HOUSE_STYLE tokens (core colours, players, Pip skin and hair, fonts, type scale, shape, motion, world) plus the owner-approved ink-20 (Chalk and Sky), ink-45 and ink-70 tints and the 64px small TV button, and declares the allowed text/background pairs. @couchcade/theme/generate provides toCssVars() (:root --cc-* variables) and toPhaserColor()/toPhaserColors(), both snapshot-tested. @couchcade/theme/scenes registers scene palettes from src/scenes/<game-id>.ts with import.meta.glob (quick-draw desert, strike-night alley, pixel-derby track, taken from HOUSE_STYLE) and enforces unique ids and the 16-colour cap. The WCAG AA test checks every declared pair; ink-45 is the only exempt pair (disabled controls). Chalk on Turf and Signal pass only through their Ink halo, which is flagged to the owner. Tests read HOUSE_STYLE.md so tokens and doc can't drift. 48 tests.
<!-- SECTION:FINAL_SUMMARY:END -->
