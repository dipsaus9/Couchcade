---
id: CC-3.10
title: Show extra joiners as audience
status: Done
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-17 16:30'
labels:
  - story
dependencies:
  - CC-3.1
  - CC-3.5
references:
  - apps/server/src/room/room.ts
  - apps/server/src/room/audience.ts
  - apps/controller/src/screens/audience/
  - apps/server/src/api/join.ts
  - apps/server/test/audience.test.ts
  - apps/server/test/api.test.ts
  - packages/protocol/src/close-codes/index.ts
  - packages/protocol/test/api.test.ts
  - docs/architecture/platform.md
  - apps/controller/src/App.vue
  - apps/controller/src/session/state.ts
  - apps/controller/src/runtime/controller.ts
  - apps/controller/src/join/copy.ts
  - apps/controller/src/screens/waiting/copy.ts
  - apps/controller/src/screens/room-full/
  - apps/controller/test/audience/
  - apps/controller/test/state.test.ts
  - apps/controller/test/runtime/controller.test.ts
  - apps/host/src/runtime/host-runtime.ts
  - apps/host/src/screens/lobby/lobby-state.ts
  - apps/host/test/runtime/host-runtime.test.ts
  - apps/host/test/runtime/recovery.test.ts
  - apps/host/test/lobby-state.test.ts
parent_task_id: CC-3
type: feature
ordinal: 59000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Friend number nine can still join and watch.

Type: deliverable
Branch: CC-3.10/audience-mode
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Audience phones show a "Watching" screen
- [x] #2 Audience members take a free slot when a player leaves between games
- [x] #3 When 16 phones (8 players + 8 audience) are in the room, a further join returns 409 room-full and the phone shows the approved Room is full error screen
- [x] #4 The 9th to 16th joiners become audience
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Server apps/server/src/room/audience.ts: pure maxPhones (16), roomMembers count (open phone ids + held seats), planPromotions(taken slots, audience by joinedAt), promotesIn(phase).
2. room.ts: refuse a new player id at connect when 16 phones are in the room (close 4012 room-full, new protocol close code; the API 409 stays); promote the longest-waiting connected audience member into every free seat when a seat frees (leave, expiry, kick, flood revoke) outside playing, and on room:phase leaving playing; player:promoted to host and that phone; status phones uses the same member count. Audience input already dropped by senders; test it.
3. Controller: screens/audience/ (Watching screen per the approved artboard, audience view {position} -> You're next / 3rd in line), screens/room-full/ (approved Room is full error screen for 409 and close 4012), state.ts screenOf audience + next-game, showsGameController false for audience/next-game, waiting copy for next-game.
4. Host: audience views {position} for every audience phone in every phase, next-game for seated players not in the running game; re-sent on line changes.
5. Tests: server (9th-16th audience, 17th 409 + refused at connect, promotion between games only and on phase change, audience input dropped), controller and host unit tests. E2E skipped: seatCount is a protocol constant, 9-17 browser phones too heavy.
6. Amend References with the glue files.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test

Owner decision 2026-09-16 (CC-2.1): at most 16 phones per room (8 players + 8 audience). See docs/architecture/platform.md join flow step 4 and the join API errors.

References amended 2026-09-17 (glue outside the original three paths, exact files): room-side cap needs a new close code 4012 room-full (packages/protocol close-codes + its test, docs/architecture/platform.md close codes table row); maxPhones moved from apps/server/src/api/join.ts into room/audience.ts (api.test import); controller wiring (App.vue, session/state.ts screenOf audience + next-game and 4012, runtime/controller.ts no controller for audience/next-game, join/copy.ts, screens/waiting/copy.ts next-game copy, screens/room-full/ for the approved Room is full screen); host audience {position} views and next-game for mid-game joiners (runtime/host-runtime.ts, screens/lobby/lobby-state.ts); and tests. E2E skipped: seatCount is a protocol constant with no test-only override, and 9 to 17 browser phones are too heavy for CI; server tests cover the cap and promotion through the real Worker routing.

Review (dipsaus-ai:story-reviewer, round 1): verdict pass. All 4 criteria met, no scope violations, no findings. Reviewer re-ran protocol, server, controller and host tests and typechecks (all green) and cross-checked copy and rules against session-flow.md, platform.md, security.md decision 18 and platform-screens.md.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Rooms now hold up to 16 phones: the 9th to 16th joiners get slot null and the approved Watching screen, with their place in line (You're next, 2nd in line) from a host audience view { position }. The join API still answers 409 room-full, and the room now enforces the cap too: a phone it has never seen that connects while 16 phones hold a place (connected, or dropped inside the seat window) is closed with the new close code 4012 room-full, added to @couchcade/protocol and the platform.md close codes table. Both cases show the approved Room is full screen (8/8 badge, Try another code). Promotion (apps/server/src/room/audience.ts, room.ts): when a seat frees through leave, kick, flood revocation or seat expiry outside playing, and when room:phase leaves playing, the longest-waiting connected audience member gets the lowest free slot (one players write, player:promoted to the host and that phone). Audience input, calibration taps, ui actions and motion status stay dropped by the relay. Phones never show a game controller to audience or to next-game views, and seated players who aren't in the running game get Next game soon (the host now sends next-game during playing too). Tests: server audience.test.ts through the real Worker routing (cap, 4012, held places, promotion on leave, kick, expiry and phase change, dropped audience input), controller and host unit tests. No new E2E: seatCount is a protocol constant with no test-only override, and 9 to 17 browser phones are too heavy for CI.
<!-- SECTION:FINAL_SUMMARY:END -->
