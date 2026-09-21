---
id: CC-5.8
title: Detect shakes for dash moves with a button fallback
status: In Progress
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-21 03:53'
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
- [x] #1 A shake above threshold with hysteresis emits one dash event
- [x] #2 The button fallback emits the same event
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. gestures/shake.ts: createShakeDetector(options): ShakeSource<PoseReading> (no mark(), unlike
   swing/flick -- no grip concept). Mirrors swing.ts/flick.ts/tilt.ts structure and JSDoc style
   exactly. Constants: SHAKE_PEAK_THRESHOLD=14 m/s^2, SHAKE_PEAK_WINDOW_MS=400,
   SHAKE_REARM_THRESHOLD=4 m/s^2, SHAKE_REARM_QUIET_MS=300, SHAKE_COOLDOWN_MS=700. Own local
   linearAcceleration(reading): Vec3|null helper (acceleration when present, else
   gravityAcceleration - 9.81 of up), duplicated per the established per-gesture-file convention
   (swing/flick/tilt each keep their own copy). Detection: track "peak runs" above threshold
   (vector at max magnitude sample in each run, like flick.ts's candidate pattern); when a second
   finalized peak lands within 400ms of the last one and their vectors' dot product is negative,
   emit one Shake({at}) at the second peak's time, subject to the 700ms cooldown; after emitting,
   re-arm only once magnitude has stayed under 4 m/s^2 for 300ms (armed=false gates new peak runs
   from starting, independent of the cooldown check). createShakeOutput mirrors
   createSwingOutput/createFlickOutput (toRoomTime, rounding, listener set).
2. fallbacks/shake.ts: createShakeButton(options): ShakeSource<PointerPoint>, mirrors
   createSwingTap exactly -- reacts only to `type === "down"`, 700ms cooldown gate, emits
   `{at: point.t}` via the shared output.
3. gestures/index.ts, fallbacks/index.ts: add `export * from "./shake.ts";` plus one doc-comment
   bullet each, matching the aim/flick/swing/tilt lines already there.
4. test/shake/traces.ts: shakeTrace(spec) builds a version-1 Trace (gesture: "shake") with
   constant gravity and two opposite half-sine acceleration pulses on a chosen axis (a straight
   push-pull shake), via test/calibration/traces.ts's samplesOf/traceOf; replay(trace, detector)
   calibrates + runs one pose tracker + pushes readings, no marks needed.
5. test/shake/detector.test.ts: trace round-trip tests (one shake -> one dash), threshold /
   two-peaks-within-400ms / opposite-direction rules, hysteresis re-arm (a held/sustained shake or
   one hovering near threshold emits only once -- AC#1), cooldown, pure-PoseReading[] edge cases
   (same-direction peaks don't pair, stale first peak more than 400ms old doesn't pair, works with
   only gravityAcceleration i.e. no `acceleration` field), rounding, room-time conversion, reset().
6. test/shake/fallback.test.ts: createShakeButton emits `{at}` on pointerdown with the 700ms
   cooldown, ignores move/up, and its emitted shape matches the real detector's exactly (AC#2,
   mirrors swing's "fallbacks emit the same shape" test).
7. Verify: pnpm check && pnpm test (per story notes) plus pnpm build, per the worker brief's
   repo-wide gate.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test
Tune thresholds with traces from CC-5.9 when available.
<!-- SECTION:NOTES:END -->
