---
id: CC-3.4
title: Rejoin as the same player after a phone disconnects
status: To Do
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 12:27'
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
  - apps/controller/src/runtime/reconnect.ts
  - e2e/platform/rejoin.spec.ts
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test
<!-- SECTION:NOTES:END -->
