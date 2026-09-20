---
id: CC-3.27
title: Let the VIP or host end a running game early
status: Done
assignee: []
created_date: '2026-09-19 08:25'
updated_date: '2026-09-20 10:11'
labels:
  - story
dependencies: []
references:
  - packages/protocol/src/messages/index.ts
  - apps/server/src/room/moderation.ts
  - apps/server/src/room/room.ts
  - apps/host/src/runtime/host-runtime.ts
  - apps/host/src/App.vue
  - apps/host/src/session/use-host-session.ts
  - apps/controller/src/runtime/GameController.vue
  - apps/controller/src/runtime/send.ts
  - apps/host/test/runtime/host-runtime.test.ts
  - apps/controller/test/runtime/send.test.ts
  - apps/server/test/room.test.ts
  - apps/server/test/moderation.test.ts
parent_task_id: CC-3
type: feature
ordinal: 233000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Outcome: the VIP (or the host, on the TV) can stop a running game before it finishes and return to the menu, instead of every game having to run to completion.

Type: deliverable
Branch: CC-3.27/end-game-early

Reported during the CC-3.24 owner replay (2026-09-19): "I'm missing buttons to end the game early if I want to." No such control exists today on either apps/host or apps/controller.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A control on the TV (host) and/or the VIP's phone lets them end the running game early
- [x] #2 Ending early returns every phone and the TV to the menu/lobby cleanly, with no stuck state
- [x] #3 A moderation-style guard (only the VIP or host can trigger it) is in place, consistent with existing kick/lock controls
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Reuse the existing ui:action / VIP-gate pattern (menu.ts, results.ts) instead of a new message
type or a server-side change: add \"end-game\" to protocol's uiActions (phone -> relay -> host,
already generically forwarded). In host-runtime.ts add endGameEarly(): stops the loop/snapshots/
stage, skips the results screen (nothing to show for an unfinished game) and reopens the menu for
the VIP the same way begin()'s dropped-chunk recovery and finishRecovery()'s \"menu\" case already
do, so every phone and the TV land back on the menu/lobby through the exact code path that's
already tested for a natural finish. Wire two triggers: the TV's own button calls
runtime.endGameEarly() directly (host is authoritative, no guard needed); the VIP's phone sends
ui:action:end-game, gated in handle() to `from === vip(state)?.id` (same shape as kick's guard,
applied host-side since only the host runtime knows who the VIP is -- the relay has no VIP
concept). The controller can't determine client-side who the current VIP is during play (that's
only ever pushed per-screen in lobby/menu/results view data, never during a running game, and
extending that would touch files outside this story's References), so the phone's End Game
button is shown to every seated player in GameController.vue; the host-side guard is what
actually enforces AC3, matching how the relay-level guard is what enforces kick, not client UI.
Necessary plumbing: apps/host/src/session/use-host-session.ts needed one new wrapper
(endGameEarly -> runtime?.endGameEarly()) for App.vue to reach the runtime at all, the same way
calibration.start/moderate.kick already do -- that file isn't in the story's declared References;
flagged explicitly in the final report rather than silently expanded.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Scope note: apps/host/src/session/use-host-session.ts needed one small addition (an endGameEarly
wrapper around runtime.endGameEarly(), returned alongside the existing calibration/moderate
wrappers) so App.vue could reach the host runtime for the TV button. That file is not in this
story's declared References. It's the minimum plumbing App.vue needs (mirrors the existing
calibration.start / moderate.kick pattern exactly) and adds no new business logic -- all the
actual end-game behaviour lives in host-runtime.ts, which is in scope. Flagging per the
"stop and report if the real fix needs files outside References" instruction rather than silently
expanding scope.

Design note: the phone's "End game" button (GameController.vue) is shown to every seated player
in the running game, not just the VIP. The controller has no way to know client-side who the
current VIP is during play -- lobby/menu/results views each carry an explicit vip flag from the
host, but the running game's own view is entirely game-controlled data, and there's no platform-
level channel for VIP status during play without touching apps/controller/src/session/state.ts or
apps/host/src/runtime/view-sync.ts (both outside this story's References). AC3 is still satisfied
by the host-side guard (handle() only acts on a VIP's ui:action:end-game; anyone else's is a
silent no-op), the same way the relay-level guard is what actually enforces kick, not client UI.
A non-VIP tapping "End game" today just does nothing. Worth a small fast-follow story if the
owner wants the button VIP-only-visible: broadcast a lightweight vip flag alongside the running
game's view.

Review gate round 1 (dipsaus-ai:story-reviewer, sonnet): verdict block. All 3 acceptance criteria
individually verified met (with reasoning per-criterion); pnpm check/test/build all green. Sole
blocking finding: scopeViolations: ["apps/host/src/session/use-host-session.ts"] -- a required
11-line wrapper (endGameEarly() -> runtime?.endGameEarly(), returned alongside the file's existing
calibration/moderate wrappers) so apps/host/src/App.vue (in scope) can reach the runtime for the
TV's own "End game" button. use-host-session.ts is not a declared Reference. Reviewer's own
assessment: "this reads as a References-list omission in the story rather than an implementer
overreach" and recommends adding it to References on redelivery, rather than treating it as a
defect. Advisory (non-blocking) finding also raised: the phone's End Game button is visible to
every seated player, not just the VIP (see design note above) -- flagged as a fast-follow
candidate, not a blocker.

Status reverted to In Progress: not pushed, no PR opened. This needs a scope decision (amend
CC-3.27's References to include apps/host/src/session/use-host-session.ts, or accept dropping the
TV control to stay strictly in scope) that a delivery agent isn't authorised to make unilaterally.
Escalating to the orchestrator per the "stop and report, don't guess" instruction. All commits are
on branch CC-3.27/end-game-early in .worktrees/CC-3.27, ready to push once resolved.

Review gate round 2 (dipsaus-ai:story-reviewer, sonnet): verdict pass. References widened by the orchestrator to include apps/host/src/session/use-host-session.ts resolved round 1's sole blocking finding; no code changed. All 3 acceptance criteria re-confirmed met, no scope violations remain. One advisory (non-blocking) finding carried over: the phone's End Game button is visible to every seated player, not just the VIP (client has no VIP signal during play); enforcement is host-side and AC3 is met regardless. Filed as a fast-follow story after this one closes.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added a game:end-style "end game early" control, distinct from room:end. A new phone-only
ui:action value (\"end-game\") flows through the existing relay forwarding unchanged; host-runtime's
new endGameEarly() stops the loop, snapshots and stage, skips the results screen (there's nothing
to show for an unfinished game) and reopens the menu for the VIP through the same code path
begin()'s dropped-chunk recovery and finishRecovery() already use, so every phone and the TV land
back on the menu/lobby with no stuck state. Two triggers: a TV button (apps/host/src/App.vue,
wired through apps/host/src/session/use-host-session.ts) that calls the runtime directly (host is
authoritative, no guard needed), and a VIP's phone tap (apps/controller/src/runtime/
GameController.vue) that host-runtime.ts gates to the current VIP, the same guard shape as kick.
The phone control is shown to every seated player (the client can't learn who's VIP during play
without touching files outside this story's scope, flagged as a fast-follow); the host-side guard
is what actually enforces AC3. Verify: pnpm check, pnpm test (full monorepo) and pnpm build all
green; 5 new host-runtime tests and 1 new send.ts test cover the VIP path, the non-VIP no-op, the
outside-a-game no-op and the TV's direct call. Independent review passed on round 2 (round 1
blocked only on References not yet covering use-host-session.ts, since fixed by the orchestrator).
<!-- SECTION:FINAL_SUMMARY:END -->
