---
id: CC-5.4
title: Detect grip-and-swing gestures with a swipe fallback
status: To Do
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 12:28'
labels:
  - story
dependencies:
  - CC-5.3
references:
  - packages/motion/src/gestures/swing.ts
  - packages/motion/src/fallbacks/swing.ts
  - packages/motion/test/swing/
parent_task_id: CC-5
type: feature
ordinal: 74000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Bowling, golf, baseball and tennis get one swing event.

Type: deliverable
Branch: CC-5.4/swing-gesture
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 While the grip button is held, a swing emits { speed 0–1, angle degrees, spin -1..1, peakAt timestamp }
- [ ] #2 Movements below the threshold emit nothing
- [ ] #3 The swipe fallback emits the same shape
- [ ] #4 Tests replay synthetic swing traces
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test
Tune thresholds with traces from CC-5.9 when available.
<!-- SECTION:NOTES:END -->
