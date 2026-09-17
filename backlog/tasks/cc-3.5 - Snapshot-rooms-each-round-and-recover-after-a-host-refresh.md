---
id: CC-3.5
title: Snapshot rooms each round and recover after a host refresh
status: Done
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-17 16:01'
labels:
  - story
dependencies:
  - CC-3.1
  - CC-2.6
  - CC-1.15
references:
  - apps/server/src/room/room.ts
  - apps/server/src/room/snapshot.ts
  - apps/host/src/runtime/recovery.ts
  - e2e/platform/host-recovery.spec.ts
  - apps/server/src/room/storage.ts
  - apps/server/test/snapshot.test.ts
  - apps/host/src/runtime/host-runtime.ts
  - apps/host/src/runtime/game-runner.ts
  - apps/host/test/runtime/recovery.test.ts
  - apps/host/test/runtime/host-runtime.test.ts
  - apps/host/src/screens/menu/MenuScreen.vue
  - packages/game-sdk/src/contract/index.ts
  - packages/game-sdk/testing/contract.ts
  - packages/game-sdk/test/contract-kit.test.ts
  - e2e/src/quick-draw.ts
  - e2e/games/quick-draw.spec.ts
parent_task_id: CC-3
type: feature
ordinal: 54000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Refreshing the TV doesn't end the night.

Type: deliverable
Branch: CC-3.5/snapshots-and-recovery
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The host sends room:snapshot at the end of each round (one SQLite write)
- [x] #2 A refreshed host reconnects, loads the last snapshot and resumes at the start of the next round
- [x] #3 An E2E test reloads the host mid-game and asserts scores are kept
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Server: snapshot.ts stores room:snapshot in a one-row snapshot table (round, game_id, data, saved_at; one upsert per message), storage.ts creates/migrates it and room.ts saves on host room:snapshot and sends the stored one after the host's player:joined burst in welcome.
Host: recovery.ts holds SnapshotData {p,t,g,party?}, the snapshot sender (round 0 at game start, snapshot(state) checked every 30 ticks, sent on change at most once per 5 s with latest-wins, game part <= 600 bytes else dev error and skip) and the pure recovery decision table (playing+restorable -> restore; playing otherwise -> menu with 'The TV restarted, so that game ended'; menu/motion-check/results -> menu; calibration/lobby -> lobby).
host-runtime.ts: the first welcome of a fresh runtime starts recovery, which waits for clock sync (5 samples) so player:joined and room:snapshot have arrived, then applies the decision; restore uses data.p ∩ seated players, a new seed and game time restarting at 0 (matches Quick Draw/Target Range restore and withRewind). Replaces CC-1.15's reset-to-lobby. game-runner.ts accepts a restore snapshot.
game-sdk: maxGameSnapshotBytes = 600 in contract; testGameContract checks the game part against it.
E2E host-recovery.spec.ts: Quick Draw via the real menu, finish round 1, reload TV, assert rejoin, points kept, resume at round 2, one snapshot per round; plus a menu-phase refresh that comes back to the menu.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test

Scope amended at pickup (worker, owner away): the four story References need glue. apps/server/src/room/storage.ts (snapshot table + migration), apps/server/test/snapshot.test.ts, apps/host/src/runtime/host-runtime.ts (send snapshots, recovery flow), apps/host/src/runtime/game-runner.ts (start from restore), apps/host/test/runtime/recovery.test.ts and host-runtime.test.ts (replaces CC-1.15's reset-to-lobby test), apps/host/src/screens/menu/MenuScreen.vue (notice line), packages/game-sdk/src/contract/index.ts + testing/contract.ts + test/contract-kit.test.ts (CC-1.13 follow-up: 600-byte game snapshot limit), e2e/src/quick-draw.ts (Quick Draw bot helpers extracted from e2e/games/quick-draw.spec.ts so both specs share them).
Decision (doc conflict flagged): session-flow.md says a restored game 'continues game time from data.t', but Quick Draw's and Target Range's restore and withRewind (CC-3.7) all restart game time at 0. Continuing the runner's clock from t would misjudge every tap against state times that restarted at 0, so the runner restarts at tick 0 after restore; t is still recorded in SnapshotData. Recommend amending session-flow.md Recovery table to 'game time starts at 0, as restore does'.
Players: SnapshotData.p lists ids only, and a refreshed TV only knows seated players, so restore gets p ∩ seated (init order); onPlayerLeft can't be called for players the TV has no info on, so if fewer than players.min remain the game ends to the menu with the notice.

Review (story-reviewer, round 1): pass. AC1-3 met, no scope violations. Advisories: (1) restore gets data.p ∩ seated and onPlayerLeft isn't called for players no longer seated (the TV has no PlayerInfo for them); doc wording follow-up together with (3); (2) a restored needsMotion game starts with no touch players, so touch players count as motion until their phone re-sends motion:status (only Target Range, still hidden); (3) session-flow.md still says game time continues from data.t while the runner restarts at 0 like every game's restore. pnpm-lock.yaml and the task file were left out of the reviewer diff on purpose (lockfile unchanged).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The relay now stores the host's room:snapshot in a one-row snapshot table (one upsert per message, table added to new and existing rooms) and sends it to a host that rejoins, after the player:joined burst. The host runtime sends round 0 right after init (null for games without snapshots), checks the game's snapshot every 30 ticks and sends it on change with the round one higher, at most once per 5 s with the latest value winning, skipping a game part over 600 bytes with a dev warning. A new TV tab whose first welcome isn't lobby waits for its 5 clock samples, then follows the recovery table: playing with a restorable snapshot resumes the game from restore() with the in-game players still seated and a new seed (game time restarts at 0, as Quick Draw, Target Range and withRewind expect); other playing goes to the menu with 'The TV restarted, so that game ended'; menu, motion-check and results go to the menu; calibration goes to the lobby. room:phase is only sent when recovery lands somewhere other than the stored phase. This replaces CC-1.15's reset to lobby. testGameContract now checks the 600-byte game snapshot limit (CC-1.13 follow-up). E2E e2e/platform/host-recovery.spec.ts plays a Quick Draw round via the real menu, reloads the TV and asserts the rejoin, the stored snapshot, kept points and play resuming at round 2 (then round 2 counts on to 2 points), plus a menu-phase reload that comes back to the menu; Chromium and WebKit pass. Quick Draw bot helpers moved to e2e/src/quick-draw.ts. Follow-up: amend session-flow.md (game time restarts at 0; restore gets in-game players still seated).
<!-- SECTION:FINAL_SUMMARY:END -->
