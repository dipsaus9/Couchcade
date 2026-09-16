---
id: CC-5.7
title: Stream tilt steering with a joystick fallback
status: To Do
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 12:28'
labels:
  - story
dependencies:
  - CC-5.3
  - CC-3.6
references:
  - packages/motion/src/gestures/tilt.ts
  - packages/motion/src/fallbacks/tilt.ts
  - packages/motion/test/tilt/
parent_task_id: CC-5
type: feature
ordinal: 77000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Bumper Sumo and Paddle Panic get tilt steering.

Type: deliverable
Branch: CC-5.7/tilt-gesture
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Tilt emits a normalised x/y vector with a dead zone
- [ ] #2 Tilt is sent through the CC-3.6 batching helper
- [ ] #3 A joystick vector adapter produces the same shape
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test
Tune thresholds with traces from CC-5.9 when available.
<!-- SECTION:NOTES:END -->
