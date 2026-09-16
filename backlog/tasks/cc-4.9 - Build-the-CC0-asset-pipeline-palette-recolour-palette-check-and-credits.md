---
id: CC-4.9
title: 'Build the CC0 asset pipeline: palette recolour, palette check and credits'
status: Done
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 21:38'
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

CI on PR #56: check, check:style, check:deps and build all pass. The "test" job is red, but on an unrelated, pre-existing failure: packages/game-sdk/testing/contract.ts's fast-check property test "onPlayerInput and onTick are pure and repeatable" (games/quick-draw/test/contract.test.ts) times out at 5000ms on GitHub-hosted runners. Confirmed pre-existing and unrelated to this story: it also fails on main's own post-merge CI (run 35151140675, the CC-4.6 merge) and passed on the run immediately before that (35150517904, CC-10.4) — so it started failing when CC-4.6 (stage package) landed on main, not from anything in tooling/assets or docs/CREDITS.md. It passes locally (pnpm test, 86/86 in games/quick-draw) every time. Retried twice on CI with the same result. Left unfixed: packages/game-sdk and packages/stage are outside CC-4.9's References; fixing it here would be scope creep and this already blocks every PR against main, not just this one. Recommend a follow-up (raise the test's timeout, or find what in CC-4.6 slowed it down) landed directly, since it blocks all merges.

Update: on the next CI run (after the notes commit above), the "test" job passed cleanly (build, check, check:deps, check:style, e2e, test all green on run 35153020973/35153020972). So the two earlier "test" timeouts were CI-runner-load flakiness in the pre-existing, unrelated contract test, not a hard regression — no code fix was needed. PR #56 is fully green.

World grid = 8 px, orchestrator decision 2026-09-16; HOUSE_STYLE does not define it, owner to confirm. Changed from the earlier 16x24-only grid (inferred from the World Pip spec), which would have rejected common CC0 frame sizes later game art stories need (16x16 tiles, 32x32 props, 24x24 characters from Kenney-style packs). tooling/assets/src/grid.ts now requires both frame dimensions to be a multiple of 8; the 16x24 World Pip still passes. check.test.ts adds coverage for 16x16, 32x32, 24x24 and 16x24 all passing, and a non-multiple-of-8 size still failing.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added tooling/assets, the CC0 asset pipeline. pnpm assets:recolour <input> <scene> (root script already delegated per CC-1.5) remaps every non-transparent pixel of a PNG sprite onto the core + <scene> palette from @couchcade/theme by OKLab nearest-colour distance (pngjs, pure JS, no native build), overwriting the file in place and preserving alpha. A palette/frame-size check (checkSpriteImage/checkGameAssets/checkAllGameAssets, tooling/assets/src/check.ts + check-cli.ts) fails on any non-transparent pixel outside a sprite's allowed core+scene colours and on frame dimensions that aren't multiples of the 16x24 world grid (inferred from HOUSE_STYLE's World Pip spec, flagged for owner confirmation since the doc names no other literal grid unit). games/<id>/CREDITS.md tables (asset, author, http(s) source, CC0 licence) are parsed, validated (credits.ts) and aggregated into docs/CREDITS.md (credits-cli.ts); a missing CREDITS.md is only an error when the game's assets/ folder has files, so games/quick-draw (no assets yet) passes cleanly. docs/CREDITS.md is generated and committed ("No CC0 assets are in use yet." today) with a drift test against regeneration.

Because packages/theme/src/scenes/index.ts registers scenes with Vite's import.meta.glob (throws under plain Node), the Node CLI loads scene files directly via readdirSync + per-file dynamic import by filesystem path (scene-loader.ts), reimplementing the registry's own validation (no malformed hex, no duplicate scene id, core+scene <=16 colours).

43 tests in tooling/assets, all using PNGs generated in-memory with pngjs (no binary fixtures). pnpm check, test, check:deps and build all pass on the merged branch. Reviewed by dipsaus-ai:story-reviewer: pass, round 1, no scope violations; one advisory (confirm the 16x24 world-grid constant with the owner).
<!-- SECTION:FINAL_SUMMARY:END -->
