---
id: CC-5.6
title: Detect flick throws with a swipe fallback
status: Done
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-17 17:10'
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
- [x] #1 A flick emits { power 0–1, direction degrees, wobble 0–1, at timestamp }
- [x] #2 The swipe fallback emits the same shape
- [x] #3 Tests replay synthetic flick traces
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

Detector: pitch-down rate is measured around the horizontal axis right of the top edge's heading; direction integrates the top edge's heading rate (not world yaw), so a wrist twist adds to wobble and not to direction. A flick that peaked while gripped is still emitted if its acceleration arrives within 100 ms after a grip-up at the peak. Swipe fallback throws on finger lift and reuses createSwingSwipe for the 60 px rule and the power mapping; wobble samples the path evenly by distance. No recorded flick traces exist yet (CC-5.9 recorder is built, none saved), so defaults are untuned against real phones.

Review gate (dipsaus-ai:story-reviewer, sonnet, round 1): pass. AC1-3 met, no scope violations, no findings.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added createFlickDetector (packages/motion/src/gestures/flick.ts) and createFlickSwipe (packages/motion/src/fallbacks/flick.ts), both emitting { power, direction, wobble, at } per docs/architecture/motion.md Flick (CC-5.6). The detector reads pose-tracker readings while the throw grip is held: pitch-down rate over 300 deg/s with linear acceleration over 6 m/s² within 100 ms of the peak, power mapped 300..1,200 deg/s, direction from the top edge's heading change over 150 ms (±30°), wobble as off-pitch RMS over pitch RMS, one flick per grip and an 800 ms cooldown (at most 1.25 throws/s, inside the 4 inputs/s budget). The swipe pad throws on lift, reuses the swing swipe's 60 px rule and finger-speed mapping, and derives direction and wobble from the path. Tests replay synthetic dart-throw traces through calibration and the pose tracker (both gravity sign conventions) and pointer paths; defaults are not yet tuned against recorded phone traces.
<!-- SECTION:FINAL_SUMMARY:END -->
