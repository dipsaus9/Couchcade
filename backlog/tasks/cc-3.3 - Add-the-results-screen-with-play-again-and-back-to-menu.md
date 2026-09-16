---
id: CC-3.3
title: Add the results screen with play again and back to menu
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
  - apps/host/src/screens/results/
  - apps/controller/src/screens/results/
parent_task_id: CC-3
type: feature
ordinal: 52000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
After a game everyone sees who won and chooses what happens next.

Type: deliverable
Branch: CC-3.3/results-screen
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The TV shows final standings with player shapes
- [ ] #2 The VIP phone offers "Play again" and "Back to menu"; other phones show their placement
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test
<!-- SECTION:NOTES:END -->
