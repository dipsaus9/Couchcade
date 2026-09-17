---
id: CC-3.25
title: Split the game registry into eager metadata and lazily loaded rules
status: Done
assignee: []
created_date: '2026-09-17 22:18'
updated_date: '2026-09-17 23:03'
labels:
  - story
dependencies: []
references:
  - packages/game-sdk/src/contract/index.ts
  - packages/game-sdk/src/registry/index.ts
  - packages/game-sdk/src/index.ts
  - packages/game-sdk/test/contract.test.ts
  - packages/game-sdk/test/registry.test.ts
  - packages/game-sdk/test/exports.test.ts
  - apps/host/src/runtime/games.ts
  - apps/host/src/runtime/host-runtime.ts
  - apps/host/src/runtime/recovery.ts
  - apps/host/src/screens/menu/menu.ts
  - apps/host/src/session/use-host-session.ts
  - apps/host/test/runtime/host-runtime.test.ts
  - apps/host/test/runtime/recovery.test.ts
  - apps/host/test/runtime/fixtures.ts
  - apps/host/test/menu/menu.test.ts
  - tooling/create-game/template/
  - tooling/create-game/test/validate.test.ts
  - games/quick-draw/src/index.ts
  - games/target-range/src/index.ts
  - .size-limit.json
  - .dependency-cruiser.cjs
parent_task_id: CC-3
type: feature
ordinal: 225000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
apps/host/src/runtime/games.ts eagerly globs every game's src/index.ts (import.meta.glob(..., { eager: true }), CC-1.13, so the menu has every title and player count without a network round trip). A game's index.ts statically imports its whole shared/ rules module, so anything heavy a game's rules need (such as games/strike-night's @couchcade/physics/Planck.js, CC-12.2) is bundled into the platform chunk that loads before any game is picked, not into that game's own per-game chunk the way its host/ scene chunk already is (hostScene is lazy via a dynamic import). Strike Night's rules pushed "Host platform JS" from ~450 KB to ~482 KB, over the README.md-approved 450 KB budget.

This story splits each game's src/index.ts export in two: a small, eagerly-safe metadata shape (id, title, players, realtime, needsMotion, scene, hidden) the menu and recovery's player-count/title checks can read synchronously, and the full CouchcadeGame (init/onPlayerInput/onTick/view/outcome/snapshot/restore/hostScene) loaded lazily, once, only when a room actually starts that game - the same lazy pattern apps/host/src/runtime/games.ts already uses for hostScene and apps/controller already uses for the controller registry. onTick and onPlayerInput stay plain synchronous functions on the loaded game; only the *loading* of the game object becomes async, at the few call sites that currently call registry.get(id) expecting a full game back (apps/host/src/runtime/host-runtime.ts starting a game, apps/host/src/runtime/recovery.ts resuming one after a host refresh). apps/host/src/screens/menu/menu.ts keeps reading a registry, just the lightweight eager one, so its own behaviour doesn't change.

tooling/create-game's template gets the new two-file shape, and every existing game (quick-draw, target-range, strike-night) is updated to match, so the pattern isn't just documented but proven by every game in the repo. A new "Host per-game chunk" row in .size-limit.json (kind: per-game, app: host) proves a game's own rules module is measured on its own from here on, the same way its per-game controller chunk and host scene chunk already are, so this class of regression fails CI on the offending game's own budget line instead of silently inflating the shared platform total. The existing 450 KB platform budget in README.md does not change.

Type: deliverable
Branch: CC-3.25/registry-lazy-rules
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 packages/game-sdk/src/contract/ exports a GameMeta shape (id, title, players, realtime, needsMotion, scene, hidden) and a checker for it, covered by packages/game-sdk/test/contract.test.ts
- [x] #2 packages/game-sdk/src/registry/ provides an eager metadata registry and an async load(id) that resolves the full CouchcadeGame once, both covered by packages/game-sdk/test/registry.test.ts
- [x] #3 apps/host/src/runtime/games.ts's eager glob targets each game's metadata export only; a lazy loader resolves the full game
- [x] #4 apps/host/src/runtime/host-runtime.ts awaits the lazy load before starting a game; onTick and onPlayerInput remain plain synchronous calls once loaded
- [x] #5 apps/host/src/runtime/recovery.ts awaits the lazy load to resume a game from a snapshot after a host refresh
- [x] #6 apps/host/src/screens/menu/menu.ts reads the eager metadata registry for the game list and player-count fit, with no behaviour change (apps/host/test/menu/menu.test.ts stays green)
- [x] #7 games/quick-draw and games/target-range each export metadata eagerly and the full game lazily; tooling/create-game/template/ scaffolds the same shape for new games (games/strike-night, CC-12.2, isn't merged yet - it adopts the same shape when it rebases onto this)
- [x] #8 .size-limit.json gets a new Host per-game chunk budget row (kind per-game, app host); pnpm --filter @couchcade/budgets test passes
- [x] #9 README.md's Platform JS (gzip, incl. Phaser) budget stays 450 KB, unchanged
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. packages/game-sdk/src/contract/index.ts: add `GameMeta` (id, title, players, realtime, needsMotion,
   scene, hidden?) and `checkGameMeta`. `CouchcadeGame` keeps its own fields (no breaking change);
   add a small helper `gameMetaOf(game): GameMeta` for games that still export one object today.
2. packages/game-sdk/src/registry/index.ts: add `createMetaRegistry(modules)` (eager, sync, mirrors
   createRegistry but validates GameMeta) and `createLazyGameRegistry(loaders)` (mirrors
   createControllerRegistry: ids sync, load(id) async, validates full CouchcadeGame + hidden-safe).
   Keep `createRegistry`/`GameRegistry` exported for now only if something still needs it; else
   remove once host call sites move over, so there is one obvious way to get a game.
3. games/quick-draw/src/index.ts and games/target-range/src/index.ts: split into
   `src/meta.ts` (tiny, no heavy imports, exports the GameMeta literal) and keep `src/index.ts` as
   the full defineGame(...) (now importing meta.ts's literal to avoid duplicating id/title/etc).
   tooling/create-game/template/ gets the same two-file shape + placeholder tokens.
4. apps/host/src/runtime/games.ts: eager glob -> `src/meta.ts` for `metaRegistry`; new non-eager
   glob -> `src/index.ts` for `gameRegistry.load(id)`.
5. apps/host/src/screens/menu/menu.ts: swap its `GameRegistry` param for the metadata registry type
   (sync reads unchanged).
6. apps/host/src/runtime/host-runtime.ts: at the one call site that currently gets a full game
   before `start(...)`, await `gameRegistry.load(id)` first. onTick/onPlayerInput/etc. stay plain
   synchronous once loaded (no game-runner.ts change expected).
7. apps/host/src/runtime/recovery.ts: `planRecovery` needs the loaded game to call `restore`; make
   the surrounding flow await the lazy load before calling it (exact shape decided against the
   real call site once I'm in the file).
8. .size-limit.json: add "Host per-game chunk" (kind per-game, app host) with a limit measured
   from the actual quick-draw/target-range chunks + headroom (Phaser-vendor-line pattern).
9. Verify: pnpm check && pnpm test && pnpm build, plus `pnpm --filter @couchcade/budgets test`
   explicitly and record the measured Host platform JS number.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Collision check (bun backlog-workflow.ts collisions CC-3.25) found:
- CC-3.20 (host-realtime-links, To Do, unclaimed - no branch/worktree) on apps/host/src/runtime/host-runtime.ts.
- CC-11.9 (Move Target Range aim to the input channel, To Do, unclaimed) on games/target-range/src/.
- CC-12.2 and CC-12.6 on games/strike-night/src/index.ts and src/shared/ - expected/benign: CC-12.2 is this
  same worker's other in-flight story (blocked on this one), and CC-12.6 depends on undelivered stories
  including CC-12.2, so it cannot be picked up concurrently.
Neither CC-3.20 nor CC-11.9 is claimed (no live branch/worktree) as of 2026-09-18, so proceeding per the
git-contract's "two stories touching the same file is normal, reconciled at merge/PR-open time" rule
rather than serialising with an artificial dependency. Will merge origin/main often and stop if either
becomes actively claimed with conflicting changes to the same files.
This does require a packages/game-sdk contract change (a new GameMeta shape + registry split in
packages/game-sdk/src/contract/ and src/registry/), flagged per the orchestrator's request before doing it.

Review round 1: block on one scope finding — packages/game-sdk/src/index.ts's doc comment (functionally inert) wasn't in References. Added it to References rather than reverting the (accurate) comment update. Re-reviewing.

Review round 2 (dipsaus-ai:story-reviewer, model sonnet): PASS. All 9 acceptance criteria met,
no scope violations. One advisory finding (begin()'s failed-load branch untested) fixed in a
follow-up commit (a setup() gameLoadFails option + a new test) rather than deferred, since it
was cheap and directly covers new code this story added. Reviewer independently ran
pnpm --filter @couchcade/game-sdk test (304/304), pnpm --filter @couchcade/host test (207/207),
pnpm --filter @couchcade/budgets test (22/22) and pnpm --filter ./tooling/check-deps run
check:deps (clean) in the worktree itself.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Split apps/host's game discovery into an eager GameMeta registry (id, title, players, realtime,
needsMotion, scene, hidden - games/<id>/src/meta.ts, no heavy imports) and a lazy full-game
registry (games/<id>/src/index.ts, loaded once via createLazyGameRegistry when a room actually
starts that game), mirroring the lazy pattern hostScene and the controller registry already use.
packages/game-sdk/src/contract/ gained GameMeta, defineGameMeta and checkGameMeta (factored out of
checkGameDefinition, which now calls it); packages/game-sdk/src/registry/ gained
createGameMetaRegistry and createLazyGameRegistry (which shares its loader/cache logic with
createControllerRegistry through a new private createLazyRegistry helper). apps/host/src/runtime/
games.ts now exports metaRegistry (eager glob over src/meta.ts) and gameRegistry (lazy glob over
src/index.ts). menu.ts reads only the metadata registry (its onStart callback now passes a gameId,
not a full game, so it needed no async changes at all). host-runtime.ts's begin() loads the full
game before starting it (renamed the old synchronous body to beginLoaded); a failed load falls
back to the menu with a notice, and a disposed-mid-load runtime is guarded against resurrecting
itself. recovery.ts's planRecovery is now async, awaiting the game load to resume a snapshot;
finishRecovery re-checks the recovery attempt counter and the lobby after the await, since a newer
recovery or a lost connection can land while it's in flight. games/quick-draw and games/target-range
were split into meta.ts + index.ts as the reference implementation; tooling/create-game/template/
scaffolds the same shape for every new game (and its own test asserts on src/meta.ts's contents and
index.ts's import of it). .dependency-cruiser.cjs's game-index-imports-only-shared-and-sdk rule now
allows a game's own meta.ts, and a new game-meta-stays-light rule keeps meta.ts from ever importing
a heavier package, phaser or vue. .size-limit.json gained a "Host per-game chunk" budget (60 KB,
kind per-game, app host) so a game's own rules module is checked on its own from here on; measured
today at 11.6 KB (quick-draw) and 17.4 KB (target-range). The existing 450 KB "Host platform JS"
budget in README.md is unchanged, and now measures 416.26 KB (down from the pre-fix baseline,
since quick-draw's and target-range's own rules moved out of the eager platform bundle too) -
verified via `pnpm --filter @couchcade/budgets test` and the CLI report directly. Full repo
`pnpm check`, `pnpm check:deps`, `pnpm test` (all 23 packages, apps/host's 207 tests included) and
`pnpm build` are all green.

Collision note: apps/host/src/runtime/host-runtime.ts overlaps CC-3.20's declared References
(To Do, unclaimed), and games/target-range/src/ overlaps CC-11.9's (To Do, unclaimed). Proceeded
per the git contract's "two stories touching the same file is normal, resolved at merge" rule since
neither was claimed by a live branch/worktree; flagged for the orchestrator to watch for a real
conflict if either is picked up before this merges.

This story required a packages/game-sdk contract change (GameMeta + the registry split), as
flagged before starting: it touches packages/game-sdk/src/contract/index.ts and
src/registry/index.ts, not packages/game-sdk/src/link/ or apps/controller/src/runtime/ (CC-3.19's
territory), so it should not conflict with that concurrent work.
<!-- SECTION:FINAL_SUMMARY:END -->
