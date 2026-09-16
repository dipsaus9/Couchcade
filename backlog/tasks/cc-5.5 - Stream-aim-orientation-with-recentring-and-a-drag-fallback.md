---
id: CC-5.5
title: Stream aim orientation with recentring and a drag fallback
status: To Do
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 16:44'
labels:
  - story
dependencies:
  - CC-5.3
  - CC-3.6
references:
  - packages/motion/src/gestures/aim.ts
  - packages/motion/src/fallbacks/aim.ts
  - packages/motion/test/aim/
parent_task_id: CC-5
type: feature
ordinal: 75000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Archery, darts and Duck Season get a stable pointer.

Type: deliverable
Branch: CC-5.5/aim-gesture
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Yaw and pitch are emitted as -1..1 relative to a recentre point
- [ ] #2 The drag fallback emits the same shape
- [ ] #3 Aim is sampled at up to 15 Hz and sent packed through the CC-3.6 batching helper at most 4 messages per second (docs/architecture/motion.md)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test
Tune thresholds with traces from CC-5.9 when available.

Amended 2026-09-16 (motion.md conflict 1): 15 Hz is the sampling rate; the platform budget allows at most 4 messages per second.
<!-- SECTION:NOTES:END -->
