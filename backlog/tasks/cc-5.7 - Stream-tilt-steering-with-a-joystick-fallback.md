---
id: CC-5.7
title: Stream tilt steering with a joystick fallback
status: To Do
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-17 17:52'
labels:
  - story
dependencies:
  - CC-5.3
  - CC-3.6
  - CC-3.18
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
- [ ] #2 Tilt samples are sent with input.stream through the game SDK InputChannel (CC-3.18), not the CC-3.6 batching helper directly
- [ ] #3 A joystick vector adapter produces the same shape
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test
Tune thresholds with traces from CC-5.9 when available.

Amended 2026-09-17 for the approved real-time link design (docs/architecture/realtime-link.md, owner approval of CC-3.12): tilt goes through input.stream so it gets direct-link rates, and the channel does the relay packing. Depends on CC-3.18.
<!-- SECTION:NOTES:END -->
