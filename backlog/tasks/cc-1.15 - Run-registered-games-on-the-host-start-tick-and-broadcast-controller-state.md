---
id: CC-1.15
title: 'Run registered games on the host: start, tick and broadcast controller state'
status: In Progress
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 20:39'
labels:
  - story
dependencies:
  - CC-1.11
  - CC-1.13
references:
  - apps/host/src/runtime/
  - apps/host/test/runtime/
  - apps/host/src/session/use-host-session.ts
  - apps/host/src/App.vue
  - apps/host/src/main.ts
  - apps/host/package.json
parent_task_id: CC-1
priority: high
type: feature
ordinal: 38000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The host can run any registered game from start to end and return to the lobby.

Type: deliverable
Branch: CC-1.15/host-game-runtime
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The first player (VIP) can start a game; until the menu exists (CC-3.2) the first registered game is used
- [x] #2 onTick runs on a fixed 60 Hz timestep
- [x] #3 Inputs failing the game inputSchema are dropped
- [x] #4 controller:state is broadcast at most once per tick
- [x] #5 When the game ends, host and phones return to the lobby
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. runtime/games.ts: createRegistry over an eager glob of games/*/src/index.ts.
2. runtime/fixed-step.ts: accumulator loop at tickMs (60 Hz) on an injected clock and scheduler, capped catch-up.
3. runtime/game-runner.ts: one game: init with seated players and seed, input queue (drop non in-game senders and inputSchema failures), step = inputs in arrival order with clamped atMs, onTick if realtime, outcome check; views per in-game player.
4. runtime/view-sync.ts: desired views per phone, diff against last sent, send changed entries grouped by identical view, at most once per 667 ms (1.5/s) with a timer for pending changes, split over 1 KB with a dev warning.
5. runtime/stage.ts: Phaser stage port (lazy scene add/remove), attached from main.ts after boot.
6. runtime/host-runtime.ts: host clock sync on welcome/pong, VIP ui:action start -> first registry game if player count fits, room:phase playing, scene, loop; outcome -> stop, room:phase lobby, lobby views; stale playing phase after a TV refresh resets to lobby.
7. Wire into use-host-session.ts and App.vue (playing screen = stage only).
8. Tests in apps/host/test/runtime/ with test-only fixture games on fake time.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test

Readiness: collisions check names CC-3.5 (apps/host/src/runtime/recovery.ts), but CC-3.5 depends on CC-1.15 and is To Do with no branch, so it cannot be in flight; recovery.ts is not created here.

Scope amended at pickup (worker, owner away): References were only apps/host/src/runtime/. Wiring the runtime into the running TV app and testing it needs apps/host/src/session/use-host-session.ts (feed relay messages to the runtime), apps/host/src/App.vue (show the stage while a game runs), apps/host/src/main.ts (hand the booted Phaser game to the runtime), apps/host/test/runtime/ (unit tests, repo test convention) and apps/host/package.json (zod devDependency for the test-only fixture game). No To Do or In Progress story references any of these paths.

Implementation: apps/host/src/runtime/ has games.ts (eager registry glob), fixed-step.ts (accumulator loop at 1000/60 ms, catch-up capped at 60 ticks per wake-up), game-runner.ts (init with seated players + crypto seed, input queue that drops senders not in the game and inputs failing inputSchema, step = inputs in arrival order with atMs = at - tick-0 room time clamped to 500 ms, onTick only if realtime, then outcome), view-sync.ts (per-phone diff, identical views share one entry, at most one send per 667 ms with a timer for pending changes so the latest views win, greedy split over 1 KB with a dev warning, a shared entry too big is halved, a single view over 1 KB is dropped with a warning), stage.ts (Phaser scene add/remove; main.ts attaches the booted game) and host-runtime.ts (host clock sync on room:welcome/clock:pong, VIP ui:action start -> first registry game when the seated count fits, room:phase playing, initial views, scene load then ticking; outcome -> loop and scene stop, room:phase lobby, lobby view {screen: lobby, data: null} to seated players; a welcome that says playing while no game runs (TV refresh) resets the room to lobby). The 667 ms constant lives in view-sync.ts until CC-3.6 creates @couchcade/game-sdk/input. Tests: 36 new unit tests on virtual time in apps/host/test/runtime/ with a test-only Echo game (no dependency on games/). Not exercised in a browser: games/ is empty on main and the phone shell has no Start button yet, so nothing can start a game end to end until Quick Draw (CC-10.x) and the phone start action land.

Review gate round 1 (dipsaus-ai:story-reviewer): verdict pass. AC1-5 met, no scope violations. Advisories: (1) References were widened at pickup, so the PR description must say so for the owner; (2) controllerStateMinGapMs belongs in @couchcade/game-sdk/input once CC-3.6 creates it; (3) a start before Phaser's chunk loaded would run the game with no scene, fixed by making phaserStage wait for attachStage. pnpm-lock.yaml and the task file were left out of the reviewer diff on purpose. Test count correction: 34 new unit tests (not 36).
<!-- SECTION:NOTES:END -->
