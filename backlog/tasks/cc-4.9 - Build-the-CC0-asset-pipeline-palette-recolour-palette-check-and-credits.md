---
id: CC-4.9
title: 'Build the CC0 asset pipeline: palette recolour, palette check and credits'
status: In Progress
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 21:24'
labels:
  - story
dependencies:
  - CC-4.2
references:
  - tooling/assets/
  - docs/CREDITS.md
parent_task_id: CC-4
type: chore
ordinal: 69000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
CC0 sprites become on-palette, credited game assets in one command.

Type: deliverable
Branch: CC-4.9/cc0-asset-pipeline
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 pnpm assets:recolour <input> <scene> maps every pixel to the nearest colour of the core + scene palette
- [x] #2 A palette check fails on off-palette sprites and on frame sizes that aren't multiples of the world grid
- [x] #3 games/*/CREDITS.md entries (asset, author, source URL, licence) are validated and aggregated into docs/CREDITS.md
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Scaffold tooling/assets (tier: tooling; package.json with assets:recolour/typecheck/test scripts + extra credits/check-sprites scripts, tsconfig extends config/tsconfig/lib, vitest.config via defineLibConfig). Add pngjs (MIT, pure JS) + @types/pngjs to the pnpm catalog.
2. src/color-distance.ts: sRGB -> OKLab conversion + perceptual distance + nearestColor(rgb, palette). Unit tested directly (no PNG needed).
3. src/scene-loader.ts: Node-safe scene palette loader. packages/theme/src/scenes/index.ts uses Vite's import.meta.glob (throws outside Vite), so this dynamically imports the single packages/theme/src/scenes/<scene>.ts file by filesystem path and recomputes core+scene (dedup, <=16 cap) the same way registerScenePalettes does, without importing the glob module. Record this choice in notes.
4. src/png.ts: thin read/write helpers over pngjs (no native deps).
5. src/recolour.ts: maps every non-fully-transparent pixel to nearestColor from core+scene palette via OKLab distance; fully transparent (alpha 0) pixels pass through unchanged; preserves original alpha otherwise. CLI (src/cli.ts) implements `assets:recolour <input> <scene>`, overwriting the input file in place. Root package.json already wires assets:recolour -> this package (CC-1.5); no root script changes needed.
6. src/grid.ts: WORLD_GRID = 16x24 (HOUSE_STYLE World Pip spec, the only concrete sprite-frame unit in the doc) as the frame-size rule's unit; documented decision since HOUSE_STYLE's "world grid" isn't otherwise numeric.
7. src/check.ts: checkSpriteBuffer (off-palette pixel check against the exact core+scene set, plus frame width/height multiple-of-grid check) and checkGameAssets(gameDir) that walks games/<id>/assets/**/*.png. Exposed via src/check-cli.ts for manual/CI use later (CC-4.10 can wire it into check:style).
8. src/credits.ts: parse/validate games/<id>/CREDITS.md tables (asset, author, source URL, licence=CC0), aggregateCredits(repoRoot) builds docs/CREDITS.md content; treats a missing CREDITS.md as an error only when games/<id>/assets/ exists (quick-draw has neither today, so it's not an error). src/credits-cli.ts regenerates docs/CREDITS.md.
9. Generate and commit docs/CREDITS.md for the current tree (no assets yet) + a drift test asserting the committed file matches aggregateCredits(realRepoRoot).
10. Tests: generate small PNG fixtures in-memory with pngjs (on-palette / off-palette / bad frame size / transparent pixels) for recolour + check; fixture-repo-style temp dirs for credits validation (valid/missing/malformed entries, missing-file-only-when-assets-exists case). Verify pnpm check && pnpm test.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test

Delivery notes (CC-4.9):
- New tooling/assets package (tier: tooling), root assets:recolour already delegated to it (CC-1.5 placeholder). Two extra scripts not wired to root (per "root scripts are defined once"): check-sprites (pnpm --filter ./tooling/assets run check-sprites, for CC-4.10 to call checkAllGameAssets() from check:style later) and credits (regenerates docs/CREDITS.md).
- Node-safe scene loading: packages/theme/src/scenes/index.ts registers scenes with Vite's import.meta.glob, which throws under plain `node` (this CLI runs with `node src/cli.ts`, same as check-deps/smoke). tooling/assets/src/scene-loader.ts reads packages/theme/src/scenes/*.ts itself with readdirSync + per-file dynamic import(pathToFileURL(...)) and re-implements registerScenePalettes' validation (no malformed hex, no duplicate scene id, core+scene <=16 colours) rather than importing the glob-based module.
- PNG library: pngjs 7.0.0 (MIT, pure JS, no native build) + @types/pngjs, added to the pnpm catalog. Chosen over sharp/canvas (native deps, violates the €0/no-native-build constraint) and jimp (heavier, more deps than needed for read/write + raw pixel access).
- Nearest colour: OKLab perceptual distance (Björn Ottosson's formulas), plain Euclidean in OKLab space. A fully transparent pixel (alpha 0) is left untouched by recolour and skipped by the palette check; every other pixel keeps its own alpha, only RGB is remapped.
- assets:recolour overwrites the input file in place (no separate output path arg): the file becomes the on-palette sprite the game ships, matching HOUSE_STYLE's "Recolour every CC0 sprite with pnpm assets:recolour <input> <scene>" one-command framing.
- World grid decision (flagged for owner confirmation): HOUSE_STYLE.md's check:style bullet says sprite sheet frame sizes must be "multiples of the world grid" but never gives that grid a number outside the 480x270 internal canvas (480x270 isn't itself a multiple of 16 or 24, so it isn't the grid unit). The only concrete sprite-frame size in the doc is the World Pip, "16x24 pixel sprite". tooling/assets/src/grid.ts takes 16x24 as the world grid unit until a token exists in @couchcade/theme (e.g. from the Pips epic, CC-6); checkSpriteImage checks a sprite's own width/height against it (no sub-frame/sheet introspection yet — no frame-size metadata format exists in the repo).
- Credits format: games/<id>/CREDITS.md is a markdown table `| Asset | Author | Source | Licence |`; licence must match /^CC0(\s|$)/i (accepts "CC0" and "CC0 1.0"); source must be an http(s) URL. A missing CREDITS.md is an aggregation error only when games/<id>/assets/ exists and isn't empty (games/quick-draw has neither today, so it isn't an error). docs/CREDITS.md is generated (pnpm --filter ./tooling/assets run credits) and committed; test/credits.test.ts asserts it matches aggregateCredits(realRepoRoot) exactly (drift check) and that validation passes on the current tree (currently "No CC0 assets are in use yet.", since no game ships assets).
- Tests use PNGs generated in-memory with pngjs (test/png-fixtures.ts) rather than checked-in binaries. 43 tests in tooling/assets; full pnpm check/test/check:deps/build pass on the branch.
- Implied bookkeeping outside the file-level References (per WORKER_BRIEF): pnpm-lock.yaml, and the pngjs/@types/pngjs catalog additions in pnpm-workspace.yaml.
<!-- SECTION:NOTES:END -->
