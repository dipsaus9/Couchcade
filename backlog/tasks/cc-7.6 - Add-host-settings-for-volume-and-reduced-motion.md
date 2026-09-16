---
id: CC-7.6
title: Add host settings for volume and reduced motion
status: To Do
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 12:28'
labels:
  - story
dependencies:
  - CC-7.2
  - CC-4.7
references:
  - apps/host/src/settings/
parent_task_id: CC-7
type: feature
ordinal: 92000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The host controls sound and motion intensity.

Type: deliverable
Branch: CC-7.6/host-settings
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Settings store music volume, effects volume and reduced motion in localStorage
- [ ] #2 Reduced motion disables shake and flashing in stage components
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test
<!-- SECTION:NOTES:END -->
