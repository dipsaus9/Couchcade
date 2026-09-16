---
id: CC-5.6
title: Detect flick throws with a swipe fallback
status: To Do
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 12:28'
labels:
  - story
dependencies:
  - CC-5.3
references:
  - packages/motion/src/gestures/flick.ts
  - packages/motion/src/fallbacks/flick.ts
  - packages/motion/test/flick/
parent_task_id: CC-5
type: feature
ordinal: 76000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Darts gets a throw event.

Type: deliverable
Branch: CC-5.6/flick-gesture
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A flick emits { power 0–1, direction degrees, wobble 0–1, at timestamp }
- [ ] #2 The swipe fallback emits the same shape
- [ ] #3 Tests replay synthetic flick traces
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test
Tune thresholds with traces from CC-5.9 when available.
<!-- SECTION:NOTES:END -->
