---
id: CC-4.7
title: Restyle host platform screens with the stage and theme
status: To Do
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 12:28'
labels:
  - story
dependencies:
  - CC-4.6
  - CC-3.2
  - CC-3.3
  - CC-3.8
  - CC-2.6
references:
  - apps/host/src/screens/
parent_task_id: CC-4
type: feature
ordinal: 67000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Lobby, menu, results and calibration on the TV match the approved design.

Type: deliverable
Branch: CC-4.7/restyle-host-screens
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every screen under apps/host/src/screens/ uses theme tokens and stage components only
- [ ] #2 pnpm check:style passes for apps/host
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test
<!-- SECTION:NOTES:END -->
