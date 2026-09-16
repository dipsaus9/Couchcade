---
id: CC-3.10
title: Show extra joiners as audience
status: To Do
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 15:58'
labels:
  - story
dependencies:
  - CC-3.1
  - CC-3.5
references:
  - apps/server/src/room/room.ts
  - apps/server/src/room/audience.ts
  - apps/controller/src/screens/audience/
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
- [ ] #1 The 9th and later joiners become audience
- [ ] #2 Audience phones show a "Watching" screen
- [ ] #3 Audience members take a free slot when a player leaves between games
- [ ] #4 When 16 phones (8 players + 8 audience) are in the room, a further join returns 409 room-full and the phone shows the approved Room is full error screen
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test

Owner decision 2026-09-16 (CC-2.1): at most 16 phones per room (8 players + 8 audience). See docs/architecture/platform.md join flow step 4 and the join API errors.
<!-- SECTION:NOTES:END -->
