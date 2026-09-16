---
id: CC-5.3
title: Add rest calibration and axis normalisation
status: Done
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 22:53'
labels:
  - story
dependencies:
  - CC-5.2
references:
  - packages/motion/src/calibration/
  - packages/motion/test/calibration/
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
- [x] #1 Holding still for 1 second captures the gravity vector
- [x] #2 Readings are normalised to a device-independent frame (unit tests with iOS and Android sign conventions)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. packages/motion/src/calibration/ (subpath @couchcade/motion/calibration via the existing wildcard export, no root index change): vector.ts (Vec3 and quaternion maths), rest.ts (createRestCalibration: 1 s still window with gyro < 10 deg/s and |g| within 0.5 of the running mean, restart on movement, 5 s timeout with the latest 250 ms average and zero bias; up0, bias, median interval), signs.ts (gravity sign detection from the still mean y+z with the ±2 m/s² unclear band keeping the previous decision; negate both acceleration fields, never the rotation rate), frame.ts (motion frame Z = up0, Y = horizontal part of y−z or the side fallback, X = Y×Z; correctSample, normaliseSample), pose.ts (pose tracker: quaternion integration of the bias-corrected rate with dt capped at 50 ms, complementary gravity correction gain 0.02 within 1.5 m/s² of 9.81).
2. Unit tests in packages/motion/test/calibration/ with synthetic traces: both gravity sign conventions give the same motion-frame values, a noisy still phone, a phone moving during calibration (restart, then timeout), portrait tilts flat to upright, the side fallback, previous-sign reuse, and the rotation-rate sign proof (integrated rate predicts the gravity change).
3. Verify pnpm check, test, build, check:deps, check:style.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test

References amended with packages/motion/test/calibration/ (the unit tests). New subpath @couchcade/motion/calibration through the existing wildcard export; the root index is unchanged.
Built per motion.md 'Calibration and the motion frame': rest calibration (1 s still: rotation under 10 deg/s and |g| within 0.5 of the running mean; movement restarts, 5 s timeout takes the latest 250 ms with zero bias), sign detection from the still mean y + z (±2 m/s² unclear band keeps previousInverted, else W3C), motion frame, correctSample/normaliseSample, and the pose tracker (motion.md assigns it to CC-5.3 and sign rule 4's proof needs it).
Doc reading, flagged: motion.md says the side fallback for forward is '+x rotated by −90°'. Turning it the way that keeps X = Y × Z equal to +x (Y = up × x_h) is the only choice that matches the main rule at the boundary (test: 15° from the degenerate pose both rules agree in direction); the other direction would put the phone's right edge on the player's left. The 0.2 limit applies to the horizontal part of the unit y − z vector.
Rotation rate sign proof (rule 4) uses synthetic tilts whose gravity follows the physics; the first real iPhone trace from CC-5.9 still settles it for good, as motion.md says.

Review round 1: pass. Both criteria met, no scope violations. Advisory: (1) motion.md's '+x rotated by −90°' side fallback reads the opposite way in a right-handed convention; code keeps +x on the player's right as intended, suggest rewording motion.md in a later docs change. (2) Sign rule 4 is proven on a synthetic physics tilt; add a recorded tilt when CC-5.9 records traces.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added @couchcade/motion/calibration (motion.md 'Calibration and the motion frame'). createRestCalibration captures up0, the gyroscope bias and the median interval once the phone has been still for 1,000 ms (rotation under 10 deg/s, gravity-including magnitude within 0.5 m/s² of its running mean; accelerometer-only phones use only the magnitude test). Movement restarts the still second, and after 5 s it falls back to the latest 250 ms average with zero bias. The gravity sign is measured from the still mean's y + z (under −2 is inverted, the ±2 band keeps the earlier page-session decision, else W3C), never assumed per platform. The rotation rate is never flipped. motionFrame builds right/forward/up (forward from y − z, side fallback from +x), and correctSample/normaliseSample give device-independent readings. createPoseTracker integrates the bias-corrected rate (steps capped at 50 ms) with a 0.02 gravity correction near 1 g. 47 unit tests on synthetic traces: iOS and Android sign conventions give identical motion-frame values sample by sample, a noisy still phone, a phone moving during calibration (restart and timeout), portrait tilts from flat to upright, the side fallback, and the sign rule 4 proof that the integrated rate predicts the gravity change.
<!-- SECTION:FINAL_SUMMARY:END -->
