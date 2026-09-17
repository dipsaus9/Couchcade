---
id: CC-3.7
title: Add the rewind lag compensation helper for real-time games
status: Done
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-17 15:18'
labels:
  - story
dependencies:
  - CC-3.1
  - CC-1.14
references:
  - packages/game-sdk/src/rewind/
  - packages/game-sdk/test/rewind/
parent_task_id: CC-3
type: feature
ordinal: 56000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Late inputs are applied at the moment the player acted.

Type: deliverable
Branch: CC-3.7/rewind-lag-compensation
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The helper keeps 200 ms of state history
- [x] #2 An input with a host-time timestamp rewinds, applies and re-simulates, capped at 150 ms
- [x] #3 A deterministic unit test proves the same final state as an on-time input
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. packages/game-sdk/src/rewind/with-rewind.ts: pure withRewind(rules, options) per session-flow.md 'Lag compensation with rewind': Rewound<TState> {now, tick, pending, history, dirtyFrom, seq}; init/onPlayerInput/onTick/onPlayerLeft/unwrap plus wrap (fresh history for restore).
2. onPlayerInput only records (seq, target tick clamped to [tick-9, tick], future -> now, older than 150 ms -> oldest reachable); onTick re-simulates once from dirtyFrom, then runs the tick, keeps 12 entries (200 ms). onPlayerLeft settles pending late inputs, applies the leave and clears the history so a later rewind can't undo it.
3. index.ts re-exports; no game wired, no host change.
4. test/rewind/with-rewind.test.ts: small real-time fixture game through createFakeRoom; late input vs on-time deep-equal (AC3), cap, clamp, history length, purity, JSON, display lag option, leaves, testGameContract. No physics test: game-sdk and physics are both core and may not import each other.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test

Target tick uses ceil(atMs / tickMs), not floor as the session-flow.md sketch writes. The host runner applies an input stamped in (T(k-1), T(k)] at tick k, so ceil keeps on-time inputs out of the rewind path and lands a late input exactly where it would have landed on time; floor would rewind nearly every on-time input by one tick and apply it before the player acted. Follow-up: correct rule 1 in docs/architecture/session-flow.md (outside this story's References).
Display lag (CC-3.8): default tick comes from atMs alone (room clock already removes network lag); subtractDisplayLag: true uses atMs - displayLagMs, for games reacting to motion on the TV. Cap stays 150 ms either way.
Added onPlayerLeft to the wrapper (worker-1 left it as a known gap): without it a rewind re-simulated from before a leave and undid it. The leave settles pending late inputs, applies the game's onPlayerLeft and clears the history.

Review: round 1 block (scope: test/rewind/ not in References; fixed by adding the reference). Round 2 pass, all 3 criteria met, no scope violations. Advisories: session-flow.md rule 1 says floor but code uses ceil (justified, doc follow-up), API adds onPlayerLeft/wrap beyond the doc sketch; fixed-step assumption in onPlayerLeft now commented.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added @couchcade/game-sdk/rewind with withRewind, a pure wrapper around a real-time game's init, onPlayerInput, onTick and onPlayerLeft. The wrapped state is plain JSON and carries 200 ms (12 ticks) of history. A late input is filed under the tick the player acted in (ceil(atMs / tickMs), optionally atMs - displayLagMs with subtractDisplayLag for CC-3.8), capped at 150 ms (9 ticks), never dropped, and future stamps apply at the next tick. onTick re-simulates once from the earliest dirty tick. A leave settles pending late inputs and clears the history so a rewind can't undo it. unwrap/wrap serve view, outcome, snapshot and restore. The game contract, host runner and games are unchanged. 31 unit tests with a puck fixture game prove that a late input gives the same final state as the same input on time (also over seeded random matches), and cover the cap, clamping, history length, purity, JSON round trips, display lag, leaves and the contract test kit. Follow-up: session-flow.md rule 1 says floor; ceil matches the host runner's on-time tick.
<!-- SECTION:FINAL_SUMMARY:END -->
