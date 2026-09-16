---
id: CC-9.3
title: Add attract mode on the TV when the lobby is idle
status: To Do
assignee: []
created_date: '2026-09-16 12:25'
updated_date: '2026-09-16 12:28'
labels:
  - story
dependencies:
  - CC-4.7
references:
  - apps/host/src/attract/
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
- [ ] #1 After 60 s idle in an empty lobby the TV cycles game previews
- [ ] #2 Any join returns to the lobby immediately
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test
<!-- SECTION:NOTES:END -->
