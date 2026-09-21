---
id: CC-5.8
title: Detect shakes for dash moves with a button fallback
status: To Do
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-21 03:41'
labels:
  - story
dependencies:
  - CC-5.3
references:
  - packages/motion/src/gestures/shake.ts
  - packages/motion/src/fallbacks/shake.ts
  - packages/motion/test/shake/
  - packages/motion/src/gestures/index.ts
  - packages/motion/src/fallbacks/index.ts
parent_task_id: CC-5
type: feature
ordinal: 78000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Bumper Sumo gets a dash trigger.

Type: deliverable
Branch: CC-5.8/shake-gesture
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A shake above threshold with hysteresis emits one dash event
- [ ] #2 The button fallback emits the same event
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test
Tune thresholds with traces from CC-5.9 when available.
<!-- SECTION:NOTES:END -->
