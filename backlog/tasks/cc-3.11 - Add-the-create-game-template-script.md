---
id: CC-3.11
title: Add the create-game template script
status: Done
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-17 10:11'
labels:
  - story
dependencies:
  - CC-3.1
  - CC-1.13
references:
  - tooling/create-game/
parent_task_id: CC-3
type: chore
ordinal: 60000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A new game package is generated consistently in one command.

Type: deliverable
Branch: CC-3.11/create-game-template
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 pnpm create-game <id> "<Title>" creates games/<id> with package.json, src/host, src/controller, src/shared, src/index.ts and a contract test
- [x] #2 The generated package passes pnpm check and pnpm test
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Build tooling/create-game as a workspace package that owns the root `create-game` script:
1. tooling/create-game/src/generate.ts: pure-ish helpers - validateId, validateTitle,
   templateFiles(id, title) returning path->content map with placeholders replaced
   (__ID__, __TITLE__, __ID_PASCAL__, __ID_CAMEL__), writeGame(gamesDir, id, title).
2. tooling/create-game/src/cli.ts: `pnpm create-game <id> "<Title>"` entry - validates args
   against games/<id> in the real repo, writes the template, runs `pnpm install`, prints the
   checklist from session-flow.md's "Create-game template" section.
3. Template content (minimal "first to 5 taps wins", 1-8 players, realtime:false,
   needsMotion:false, scene:"desert"): package.json (@couchcade/game-<id>, workspace:*/catalog:
   deps mirroring quick-draw minus browser-test-only deps), tsconfig.json (extends
   @couchcade/config/tsconfig/vue.json), vitest.config.ts (defineLibConfig), src/index.ts
   (defineGame), src/shared/{input,state,view,rules,snapshot}.ts + index.ts barrel,
   src/host/scene.ts (extends StageScene, addScoreboard+addCallout only, no hand-rolled
   world drawing so CC-4.11's overlay work applies for free), src/controller/{index.ts,
   Controller.vue} (defineController + CcBigAction), assets/.gitkeep, test/contract.test.ts
   (testGameContract), test/rules.test.ts, CREDITS.md.
4. Tests:
   - tooling/create-game/test/validate.test.ts: unit tests for id/title validation
     (kebab-case, length, existing folder collision) - fast, no I/O beyond temp dirs.
   - tooling/create-game/test/generate.test.ts: generates the template into a real temp
     folder under games/ inside the actual monorepo (per session-flow.md's own description
     of this test), hand-links its node_modules by copying the existing symlink entries
     from games/quick-draw/node_modules (same relative depth, no `pnpm install` needed so
     the real lockfile/node_modules are never touched), then runs the generated package's
     `typecheck` and `test` scripts (which run testGameContract + rules.test.ts) and the
     check-deps CLI (tooling/check-deps/src/cli.ts, spawned as a subprocess - not imported,
     so it doesn't trip the no-tool-imports-another-tool dependency-cruiser rule) against the
     real repo root, asserting all exit 0. Deletes the temp game folder in a finally block.
5. Wire the root package.json script (already present: `create-game` -> `pnpm --filter
   ./tooling/create-game --if-present run create-game`) - just add the `create-game` script
   to tooling/create-game/package.json.
6. Update README "Creating a game" per session-flow.md conflict 6 (already mostly correct,
   verify the script name and any remaining "copy quick-draw" wording, and confirm the
   network budget line already says 4/s not 15/s).
7. Do not commit a generated game under games/. Do not deploy.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test

Implemented as tooling/create-game (new workspace package, owns the root create-game script).
- src/generate.ts: validateId/validateTitle (id ^[a-z][a-z0-9-]{1,23}$ + games/<id> collision;
  title sentence-case + <= maxTitleLength from @couchcade/game-sdk/contract), writeGame() renders
  template/ into games/<id> with __ID__/__TITLE__/__ID_PASCAL__/__ID_CAMEL__ replaced, checklist().
- src/cli.ts: `pnpm create-game <id> "<Title>"` - validates, writes, runs `pnpm install`, prints
  the checklist from session-flow.md verbatim.
- template/: minimal "first to 5 taps wins" game (1-8 players, realtime:false, needsMotion:false,
  scene:"desert" placeholder), matching the file layout in docs/architecture/session-flow.md
  exactly: package.json, tsconfig.json (extends vue.json), vitest.config.ts (defineLibConfig),
  src/index.ts, src/shared/{input,rules}.ts, src/host/scene.ts (StageScene, scoreboard+callout
  only - no hand-rolled drawing, so it needs no change for CC-4.11's overlay-resolution work),
  src/controller/{Controller.vue,index.ts} (CcBigAction), assets/.gitkeep,
  test/{contract,rules}.test.ts, CREDITS.md. Deps mirror games/quick-draw's, minus the
  browser-test-only ones (fast-check, jsdom, playwright, @vitest/browser-playwright) since the
  template ships no browser/component tests.
- Verified end to end manually: ran `pnpm create-game zz-manual-test "Zz Manual Test"` for real,
  confirmed the generated games/zz-manual-test passes typecheck, its own `pnpm test` (16 tests,
  contract + rules) and `node tooling/check-deps/src/cli.ts` with zero violations, then deleted it
  and reconciled pnpm-lock.yaml back to just the tooling/create-game addition (AC 1, AC 2).
- Automated proof lives in tooling/create-game/test/generate-and-verify.test.ts: generates into a
  real temp folder games/cg-selftest (session-flow.md's own description of this test), links its
  node_modules by copying tooling/create-game's own already-linked node_modules entries (same
  relative symlink depth, same dependency set) instead of running `pnpm install` mid-test - avoids
  mutating the repo's pnpm-lock.yaml as a side effect of running tests - then runs its typecheck,
  test and the check-deps CLI (spawned as a subprocess so it doesn't trip the
  no-tool-imports-another-tool dependency-cruiser rule), asserting all exit 0, and deletes the temp
  folder in afterEach. Ran alongside the rest of `pnpm test` (including games/quick-draw's own
  registry-adjacent tests) with no interference.
- Excluded tooling/create-game/template/** from oxlint/oxfmt (placeholder source, never compiled
  or run as-is) and from dependency-cruiser's cruise (it isn't "a game" until rendered into
  games/<id>, which the generator's own test does for real).
- No generated game is committed under games/. No deploy.
- README's "Creating a game" section already said `pnpm create-game <id>` (no "copy quick-draw"
  wording found) - nothing to change there. The 15 msg/s -> 4 msg/s network budget line is a
  separate README pass per session-flow.md conflict 6, out of this story's scope.
- pnpm-lock.yaml changed only by adding tooling/create-game's own dependencies (48 lines); no
  catalog changes. Excluded from the reviewer diff/changed-path list per the worker brief.

Round 2 review (block): a freshly generated game failed oxfmt --check because two template files
(test/rules.test.ts, src/controller/Controller.vue) had lines over the 100-char printWidth. Fixed
by reformatting both to match real oxfmt output, and added oxfmt --check + oxlint runs to
generate-and-verify.test.ts so this can't regress silently.

Round 3 review (block, scope): the fix above initially also added a
`tooling/create-game/template/**` exclusion to the root .oxlintrc.json, .oxfmtrc.json and
.dependency-cruiser.cjs - outside the story's declared References (tooling/create-game/). Tested
directly and confirmed those exclusions were unnecessary: oxfmt --check and oxlint both pass the
template folder as-is once its lines fit printWidth (oxlint emits one warning for a placeholder
token's leading underscore, which is "suspicious" severity and doesn't fail the run), and
dependency-cruiser's check:deps already resolves every @couchcade/* import from
tooling/create-game's own linked node_modules and has no game-shaped rule that matches a path
outside games/*. Reverted all three root config files; the change is now fully contained inside
tooling/create-game/, matching References. Re-verified pnpm check, check:deps, test and build all
green with the revert.

Round 3 review: pass. Both acceptance criteria met, no scope violations, no findings.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added tooling/create-game, a new workspace package that owns the root pnpm create-game script (docs/architecture/session-flow.md, "Create-game template"). pnpm create-game <id> "<Title>" validates the id (kebab-case, not colliding with an existing games/<id> folder) and the title (sentence case, <= 16 chars), scaffolds games/<id> from tooling/create-game/template/ with a minimal generic 'first to 5 taps wins' game (package.json, tsconfig.json, vitest.config.ts, src/index.ts, src/shared/{input,rules}.ts, src/host/scene.ts extending StageScene, src/controller/{Controller.vue,index.ts}, assets/.gitkeep, test/{contract,rules}.test.ts, CREDITS.md), runs pnpm install to link it, and prints the merge checklist. tooling/create-game/test/generate-and-verify.test.ts generates a real game into a temp games/ folder inside the workspace and proves it passes testGameContract, typecheck and dependency-cruiser's check:deps with zero violations, then deletes it; also verified once by hand end to end. No generated game is committed under games/, and nothing was deployed.
<!-- SECTION:FINAL_SUMMARY:END -->
