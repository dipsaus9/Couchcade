---
id: CC-5.4
title: Detect grip-and-swing gestures with a swipe fallback
status: Done
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-17 08:25'
labels:
  - story
dependencies:
  - CC-5.3
references:
  - packages/motion/src/gestures/swing.ts
  - packages/motion/src/fallbacks/swing.ts
  - packages/motion/test/swing/
  - packages/motion/src/gestures/index.ts
  - packages/motion/src/fallbacks/index.ts
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
- [x] #1 While the grip button is held, a swing emits { speed 0–1, angle degrees, spin -1..1, peakAt timestamp }
- [x] #2 Movements below the threshold emit nothing
- [x] #3 The swipe fallback emits the same shape
- [x] #4 Tests replay synthetic swing traces
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. gestures/swing.ts: createSwingDetector fed PoseReadings from the controller's one pose tracker, grip marks, motion.md swing rules 1-7 (start 120, end <60 for 100 ms or grip-up, minPeak 240, fullPeak 900, angle from linear acceleration in the grip-down heading frame over 200 ms, spin = mean device beta over 120 ms / 540, emitOn release (300 ms) or peak (400 ms cooldown)); named constants, createSwingOutput shared with fallbacks, toRoomTime option defaulting to the room clock.
2. fallbacks/swing.ts: createSwingSwipe (60 px, 300-2400 px/s over 50 ms windows, last 80 px angle, midpoint bend spin, emitOn) and createSwingTap (speed 0.7, angle +-60 by pad half, spin 0, peakAt pointerdown).
3. Extend gestures/index.ts and fallbacks/index.ts barrels (References amended).
4. test/swing/: physical pendulum trace builder (v1 traces with grip marks), detector tests (slow/medium/firm/over-firm, twists, jitter, sub-minPeak, grip released mid-swing, grip-down reference, both gravity signs, emitOn modes, synthetic.swing replay) and pointer-path tests for swipe and tap asserting the same shape.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test
Tune thresholds with traces from CC-5.9 when available.

References amended to add packages/motion/src/gestures/index.ts and packages/motion/src/fallbacks/index.ts (barrels extended, same as CC-5.5).
Design choices inside motion.md: grip-up ends a swing in progress, so in emitOn peak that swing still emits; the peak-mode 400 ms cooldown counts from the end of the last emitted swing to the start of the next; the listener gets (swing, localPeakT) so controllers pass localPeakT as the input stream eventTimeStamp; peakAt uses toRoomTime, defaulting to toHostTime(performance.timeOrigin + t). Swipe: a swing needs >= 60 px from start and ending higher; cancel emits nothing; peak mode emits when the 50 ms window speed drops under half its peak, or on lift; one swing per touch. Tap: 400 ms cooldown, pad bounds read at each tap.
Synthetic arm-pendulum traces (test/swing/traces.ts) give exact speeds (300->0.09, 570->0.5, 900->1, 1400->1), angles within 3 deg, symmetric spin, identical results for w3c and inverted signs.

Review gate: dipsaus-ai:story-reviewer verdict pass (round 1). All 4 criteria met, no scope violations, no findings.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Shipped the swing gesture in @couchcade/motion. gestures/swing.ts: createSwingDetector reads the controller's one pose tracker and, only while the grip is held, emits { speed, angle, spin, peakAt } per motion.md: start 120 deg/s, end under 60 deg/s for 100 ms or at grip-up, minPeak 240 and fullPeak 900 (owner decision 3), angle from linear acceleration in the grip-down heading frame over 200 ms, spin from the device beta twist over 120 ms / 540, emitOn release (300 ms window) or peak (400 ms cooldown), all thresholds as named constants and config, peakAt converted to room time. fallbacks/swing.ts: createSwingSwipe (60 px, 300-2400 px/s over 50 ms windows, last-80-px angle, midpoint bend spin) and createSwingTap (speed 0.7, angle +-60 by pad half), both through the shared createSwingOutput, so they emit the same shape. Barrels extended. test/swing/ replays synthetic arm-pendulum traces (slow/medium/firm/over-firm, twists, jitter, grip released mid-swing, grip-down reference, both gravity signs, synthetic.swing) and pointer paths. Reviewer pass round 1.
<!-- SECTION:FINAL_SUMMARY:END -->
