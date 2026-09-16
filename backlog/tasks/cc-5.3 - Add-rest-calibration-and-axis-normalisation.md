---
id: CC-5.3
title: Add rest calibration and axis normalisation
status: To Do
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 12:28'
labels:
  - story
dependencies:
  - CC-5.2
references:
  - packages/motion/src/calibration/
parent_task_id: CC-5
type: feature
ordinal: 73000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Gestures work the same regardless of phone model or gravity sign.

Type: deliverable
Branch: CC-5.3/rest-calibration
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Holding still for 1 second captures the gravity vector
- [ ] #2 Readings are normalised to a device-independent frame (unit tests with iOS and Android sign conventions)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test
<!-- SECTION:NOTES:END -->
