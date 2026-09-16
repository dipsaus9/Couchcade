---
id: CC-2.5
title: Add per-socket flood protection and reconnect token revocation
status: To Do
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 12:27'
labels:
  - story
dependencies:
  - CC-2.1
  - CC-3.4
references:
  - apps/server/src/room/flood.ts
  - apps/server/src/room/room.ts
parent_task_id: CC-2
type: feature
ordinal: 47000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A misbehaving client can't burn the request budget.

Type: deliverable
Branch: CC-2.5/socket-flood-protection
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Each socket has a token bucket of 20 messages/s with burst 40
- [ ] #2 Violators are disconnected and their reconnect token is revoked
- [ ] #3 A test floods a socket and asserts disconnect and revocation
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test
<!-- SECTION:NOTES:END -->
