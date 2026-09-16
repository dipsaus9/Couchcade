---
id: CC-4.8
title: Restyle controller platform screens with the UI kit
status: To Do
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 12:28'
labels:
  - story
dependencies:
  - CC-4.4
  - CC-3.2
  - CC-3.3
  - CC-3.10
  - CC-2.6
references:
  - apps/controller/src/screens/
parent_task_id: CC-4
type: feature
ordinal: 68000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Join, lobby, menu, results and error screens on phones match the approved design.

Type: deliverable
Branch: CC-4.8/restyle-controller-screens
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every screen under apps/controller/src/screens/ uses UI kit components only
- [ ] #2 pnpm check:style passes for apps/controller
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test
<!-- SECTION:NOTES:END -->
