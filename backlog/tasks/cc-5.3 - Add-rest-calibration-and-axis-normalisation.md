---
id: CC-5.3
title: Add rest calibration and axis normalisation
status: In Progress
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 22:42'
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
- [ ] #1 Holding still for 1 second captures the gravity vector
- [ ] #2 Readings are normalised to a device-independent frame (unit tests with iOS and Android sign conventions)
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
<!-- SECTION:NOTES:END -->
