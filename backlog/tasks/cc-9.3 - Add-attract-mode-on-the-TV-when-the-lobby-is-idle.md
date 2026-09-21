---
id: CC-9.3
title: Add attract mode on the TV when the lobby is idle
status: Done
assignee: []
created_date: '2026-09-16 12:25'
updated_date: '2026-09-21 04:32'
labels:
  - story
dependencies:
  - CC-4.7
references:
  - apps/host/src/attract/
  - apps/host/src/App.vue
  - apps/host/src/session/use-host-session.ts
  - apps/host/test/session/
  - apps/host/test/attract/
parent_task_id: CC-9
type: feature
ordinal: 101000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
An idle TV shows game previews like an arcade cabinet.

Type: deliverable
Branch: CC-9.3/attract-mode
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 After 60 s idle in an empty lobby the TV cycles game previews
- [x] #2 Any join returns to the lobby immediately
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1) apps/host/src/attract/attract-state.ts: a pure, timer-owning state machine (createAttractState)
   mirroring createGameMenu's schedule-based timer in screens/menu/menu.ts. lobbyChanged(empty)
   starts a 60s idle timer the first time the lobby is empty; when it fires, attract mode goes
   active and cycles metaRegistry.games on a 6s repeating timer; a non-empty lobbyChanged(false)
   cancels everything synchronously. Fully unit-tested with the existing createVirtualTime fixture
   (apps/host/test/runtime/fixtures.ts) -- no host-runtime.ts or LobbyScreen.vue changes needed,
   since the relay/game phase never leaves "lobby" for this.
2) apps/host/src/attract/AttractScreen.vue: the TV screen, reusing screens/lobby/JoinPanel.vue (room
   code + QR stay visible so attract mode is still an invitation to join) and menu.ts's
   playerCountLabel, styled like MenuScreen.vue's game cards (CcPanel, theme tokens only).
3) Wiring (apps/host/src/session/use-host-session.ts, apps/host/src/App.vue): a new "attract"
   HostScreen variant; show()'s final branch calls attract.lobbyChanged(lobby.players.length === 0)
   and picks "attract" over "lobby" when a preview is active. App.vue renders AttractScreen for it.
4) Tests: apps/host/test/attract/attract-state.test.ts (AC1 idle wait + cycling, AC2 immediate
   cancel/return, no-games edge case, repeat-call idempotency, dispose).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test

Scope note: References was amended before delivery (owner, 2026-09-21) to add App.vue,
use-host-session.ts, test/session/ and test/attract/ -- the initial References
(apps/host/src/attract/ only) couldn't reach the actual TV screen switch (App.vue's
v-else-if chain, driven by use-host-session.ts's show()), so AC1/AC2 were unreachable
from inside attract/ alone. See the delivery agent's stop-and-report for the full
analysis. host-runtime.ts and LobbyScreen.vue were NOT touched: attract mode never
changes the relay/game phase (stays "lobby" throughout), so it needed no place there.

Verify: pnpm check, pnpm test (304 tests in apps/host, incl. 9 new in
apps/host/test/attract/attract-state.test.ts), pnpm run check:style, pnpm run
check:deps, pnpm build, pnpm run budgets -- all green. Host platform JS bundle:
425.64 KB / 450 KB budget (CC-9.1), unaffected margin. pnpm e2e run for the full CI
suite (games + platform specs, chromium + webkit); result recorded once it completes.

e2e (pnpm e2e, chromium + webkit, 30 tests): 27 passed, 1 skipped, 2 failed -- both failures are
games/target-range.spec.ts:176 ("two bots play a full match and the one who aims wins"), an
aim-bot scoring assertion (points >= 100) unrelated to this story. Confirmed pre-existing and
environment-dependent, not caused by CC-9.3: re-ran the identical spec against a clean, unmodified
main checkout (no CC-9.3 changes present) and it failed the same way (score 62, then 67, then
84/56 across runs) -- games/target-range and its e2e spec have zero diff from main on this branch.
Every platform spec relevant to the lobby/join flow this story touches passed on both browsers,
including platform/smoke.spec.ts's "host opens a room, two phones join, room ends on every
device" and platform/moderation.spec.ts's kick/lock flow -- so the attract-mode wiring in
use-host-session.ts/App.vue didn't regress the lobby. Left the flaky target-range spec as is:
games/target-range/ is outside CC-9.3's References and the failure is pre-existing on main.

Reviewer (dipsaus-ai:story-reviewer, sonnet, round 1): PASS. Both acceptance criteria met, no
scope violations, no findings. Verdict JSON: {"verdict":"pass","criteria":[{"n":1,"met":true},
{"n":2,"met":true}],"scopeViolations":[],"findings":[]}. Independently reran
`pnpm --filter @couchcade/host test` (304/304 pass) and vue-tsc (clean).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added attract mode: after the TV lobby sits empty for 60 s, it cycles previews of every
registered game (title, player count, motion tag) like an arcade cabinet's demo loop, and
returns to the plain lobby the instant anyone joins. Built as a pure, fully unit-tested
timer/state machine (apps/host/src/attract/attract-state.ts, mirroring menu.ts's schedule-based
countdown) plus a TV screen (AttractScreen.vue) that reuses the lobby's own JoinPanel so the room
code and QR stay joinable throughout. Wired in as a new "attract" HostScreen computed in
use-host-session.ts's show() and rendered by App.vue's existing screen switch -- no changes to
host-runtime.ts or LobbyScreen.vue, since the relay/game phase never leaves "lobby" for this.
Both acceptance criteria are met and reviewer-verified (round 1 pass, no scope violations).
Verify: pnpm check, pnpm test (304/304 in apps/host incl. 9 new), check:style, check:deps, build
and budgets all green; e2e (30 tests, chromium+webkit) 27 passed/1 skipped/2 failed, the 2
failures being a pre-existing games/target-range aim-bot flake confirmed to fail identically on a
clean main checkout, unrelated to this story and outside its References.
<!-- SECTION:FINAL_SUMMARY:END -->
