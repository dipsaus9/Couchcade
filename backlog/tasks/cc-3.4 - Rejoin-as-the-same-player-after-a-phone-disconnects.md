---
id: CC-3.4
title: Rejoin as the same player after a phone disconnects
status: In Progress
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 23:02'
labels:
  - story
dependencies:
  - CC-3.1
  - CC-1.10
  - CC-1.16
  - CC-1.17
references:
  - apps/server/src/room/room.ts
  - apps/server/src/room/reconnect.ts
  - apps/server/src/room/storage.ts
  - apps/server/src/room/sockets.ts
  - apps/server/test/room.test.ts
  - apps/server/test/reconnect.test.ts
  - apps/host/src/runtime/host-runtime.ts
  - apps/host/src/runtime/view-sync.ts
  - apps/host/src/runtime/game-runner.ts
  - apps/host/test/runtime/
  - apps/controller/src/runtime/reconnect.ts
  - apps/controller/src/session/session.ts
  - apps/controller/src/session/socket.ts
  - apps/controller/src/session/state.ts
  - apps/controller/test/runtime/reconnect.test.ts
  - e2e/platform/rejoin.spec.ts
  - e2e/src/fixtures.ts
  - docs/architecture/platform.md
parent_task_id: CC-3
type: feature
ordinal: 53000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A locked or refreshed phone rejoins as the same player with the same colour and score.

Type: deliverable
Branch: CC-3.4/phone-rejoin
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A reconnect token is stored in sessionStorage and accepted for 2 minutes after disconnect
- [ ] #2 The host receives player:reconnected and re-sends the current controller state
- [ ] #3 An E2E test closes and reopens a phone context mid-game and asserts the same player slot
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Relay (apps/server/src/room/reconnect.ts + room.ts + storage.ts): a closed phone keeps its seat for 2 minutes (players.left_at set, new released flag false). The room's single alarm now wakes at min(close deadline, earliest seat expiry); on alarm (and before seating a phone) due seats are released and the host gets player:left expired. A returning player inside the window gets the same slot and the host gets player:reconnected; a released or expired player closes with 4011. player:leave releases at once. A reconnecting host gets player:joined connected:false for reserved seats. Hook comment for CC-2.5/CC-2.6 kicked/revoked. Lazy ALTER TABLE for rooms created before the column.
2. Host (apps/host/src/runtime/view-sync.ts, host-runtime.ts, game-runner.ts): on player:reconnected/joined the view sync forgets that phone's last view so the next send window (still 667 ms apart) includes it; on player:left with a freed seat the runner calls onPlayerLeft for in-game players.
3. Phone (apps/controller/src/runtime/reconnect.ts, session/session.ts, session/socket.ts, session/state.ts): reconnect at once when the page becomes visible and the socket is closed; show Connection lost only after 1 s without a socket.
4. E2E e2e/platform/rejoin.spec.ts (+ sessionStorage option in e2e/src/fixtures.ts): Quick Draw via menu, close Ben's context mid-game, reopen with his stored session, assert same player id/slot, player:reconnected on the TV, controller returns and Ben's tap scores.
5. Unit tests in apps/server/test, apps/host/test/runtime, apps/controller/test/runtime.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test
<!-- SECTION:NOTES:END -->
