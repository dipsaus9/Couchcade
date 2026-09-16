---
id: CC-2.6
title: Let the host kick players and lock the room
status: To Do
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 12:27'
labels:
  - story
dependencies:
  - CC-2.5
  - CC-1.11
  - CC-1.12
references:
  - apps/server/src/room/moderation.ts
  - apps/server/src/room/room.ts
  - apps/host/src/screens/lobby/
  - apps/controller/src/screens/kicked/
parent_task_id: CC-2
type: feature
ordinal: 48000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The host stays in control of who plays.

Type: deliverable
Branch: CC-2.6/kick-and-lock
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The host lobby shows Kick per player and a Lock room toggle
- [ ] #2 A kicked phone shows "Kicked" and can't rejoin that room
- [ ] #3 New joins to a locked room get a referee-voice "Room is locked" message
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test
<!-- SECTION:NOTES:END -->
