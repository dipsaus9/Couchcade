---
id: CC-6.5
title: Add the Pip customiser to the controller lobby
status: To Do
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 12:28'
labels:
  - story
dependencies:
  - CC-6.3
  - CC-1.12
references:
  - apps/controller/src/pips/
parent_task_id: CC-6
type: feature
ordinal: 85000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Players personalise their Pip while waiting.

Type: deliverable
Branch: CC-6.5/pip-customiser
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Players change skin tone, hairstyle and hair colour; changes send player:profile
- [ ] #2 The profile persists in localStorage for the next room
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test
<!-- SECTION:NOTES:END -->
