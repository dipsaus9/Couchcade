---
id: CC-5.8
title: Detect shakes for dash moves with a button fallback
status: Done
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-21 03:58'
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

Reviewer (dipsaus-ai:story-reviewer, model sonnet, round 1): verdict PASS. Both acceptance
criteria met: AC#1 (two-peak/opposite-direction/hysteresis/cooldown detection per motion.md
"Shake" rules 1-5, covered by dedicated tests for a sustained shake, re-arm and cooldown),
AC#2 (createShakeButton shares createShakeOutput with the detector, emits identical {at} shape,
asserted by fallback.test.ts). No scope violations. One advisory (non-blocking) finding: the
detector routes accelerometer-only phones through the shared pose tracker's gravity-corrected
frame (mirroring tilt.ts's CC-5.7 precedent), which reads in tension with "Pose tracker" rule 4's
summary phrase "have no tracker... shake uses the raw magnitude" even though it satisfies the more
specific "Shake" section rule 1 text verbatim. No action required for this story; worth a doc note
if a future story touches this area.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added createShakeDetector (packages/motion/src/gestures/shake.ts) and createShakeButton
(packages/motion/src/fallbacks/shake.ts) per docs/architecture/motion.md's "Shake (CC-5.8)" spec.
The detector needs no grip and never reads rotationRate: it tracks acceleration-magnitude peak
runs above 14 m/s^2 (mirroring flick.ts's candidate-run pattern), pairs two peaks within 400ms
whose vectors point in roughly opposite directions (dot product negative) into one dash event at
the second peak's time, gates re-detection with hysteresis (armed only once the magnitude has
stayed under 4 m/s^2 for 300ms straight, so a sustained or hovering shake fires once -- AC#1), and
gates every emit with a 700ms cooldown. Works on accelerometer-only phones since it reads linear
acceleration via the same gravity-corrected pose-tracker frame flick/swing/tilt already use
(reusing the established `linearAcceleration()` per-file helper pattern), needing no separate
low-pass filter. The button fallback shares the detector's own output/rounding helper, so it
structurally emits the identical `{ at }` shape on pointerdown with the same cooldown (AC#2).
Wired into the public @couchcade/motion/gestures and @couchcade/motion/fallbacks subpaths via the
barrel index.ts files, matching the CC-5.4/CC-5.6 precedent (References were widened for this by
the orchestrator before delivery). 24 new tests (detector.test.ts, fallback.test.ts) cover the
threshold, direction, hysteresis re-arm, cooldown, the gravityAcceleration-only fallback path,
rounding, room-time conversion and reset(); full trace round-trip tests via a new synthetic
push-pull shake trace builder (traces.ts). Independent reviewer (story-reviewer, sonnet) verdict:
pass, both criteria met, no scope violations, one non-blocking advisory note about doc-section
phrasing (recorded in task notes). pnpm check, pnpm test (all 293 motion package tests plus the
full repo suite) and pnpm build all green; pnpm check:deps clean.
<!-- SECTION:FINAL_SUMMARY:END -->
