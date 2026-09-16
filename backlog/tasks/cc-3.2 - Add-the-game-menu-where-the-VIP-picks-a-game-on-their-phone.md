---
id: CC-3.2
title: Add the game menu where the VIP picks a game on their phone
status: To Do
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 12:27'
labels:
  - story
dependencies:
  - CC-3.1
  - CC-1.15
  - CC-1.16
references:
  - apps/host/src/screens/menu/
  - apps/controller/src/screens/menu/
parent_task_id: CC-3
type: feature
ordinal: 51000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The VIP chooses what to play next.

Type: deliverable
Branch: CC-3.2/game-menu
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The TV menu lists registered games with player counts; games not fitting the current player count are disabled
- [ ] #2 The VIP phone shows the list; other phones show "VIP is choosing"
- [ ] #3 Picking a game starts it on the host
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test
<!-- SECTION:NOTES:END -->
