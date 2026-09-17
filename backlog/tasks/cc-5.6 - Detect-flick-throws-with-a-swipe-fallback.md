---
id: CC-5.6
title: Detect flick throws with a swipe fallback
status: In Progress
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-17 16:58'
labels:
  - story
dependencies:
  - CC-5.3
references:
  - packages/motion/src/gestures/flick.ts
  - packages/motion/src/fallbacks/flick.ts
  - packages/motion/test/flick/
  - packages/motion/src/gestures/index.ts
  - packages/motion/src/fallbacks/index.ts
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

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. gestures/flick.ts: createFlickOutput (rounding, room time, listeners) and createFlickDetector over pose readings, grip marks, motion.md Flick rules 1-6: pitch-down rate around the horizontal axis right of the top edge's heading passes 300 deg/s, linear acceleration over 6 m/s² within 100 ms of the peak, power (peak-300)/(1200-300), direction = world yaw change over 150 ms before the peak clamped ±30, wobble = RMS off-pitch rate / RMS pitch rate over the same 150 ms, one flick per grip, 800 ms cooldown.
2. fallbacks/flick.ts: createFlickSwipe reusing createSwingSwipe (release) for the 60 px rule and the swing swipe's finger speed mapping; direction from the swipe chord clamped ±30; wobble from RMS sideways distance along the path / chord length × 4; at = fastest window time; 800 ms cooldown.
3. Barrels export both.
4. test/flick/: synthetic wrist-snap trace builder (pose + finite-difference acceleration), detector tests replaying traces (thresholds, calm lowering, spin in place without acceleration, direction, wobble, signs, grip, cooldown, rounding), swipe tests on pointer paths, same-shape test.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test
Tune thresholds with traces from CC-5.9 when available.

References amended (2026-09-17): added packages/motion/src/gestures/index.ts and packages/motion/src/fallbacks/index.ts, the subpath barrels that must re-export the new flick modules (same glue CC-5.4 and CC-5.5 added).
<!-- SECTION:NOTES:END -->
