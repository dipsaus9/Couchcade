---
id: CC-5.7
title: Stream tilt steering with a joystick fallback
status: Done
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-21 03:42'
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
  - packages/motion/src/gestures/index.ts
  - packages/motion/src/fallbacks/index.ts
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
- [x] #1 Tilt emits a normalised x/y vector with a dead zone
- [x] #2 Tilt samples are sent with input.stream through the game SDK InputChannel (CC-3.18), not the CC-3.6 batching helper directly
- [x] #3 A joystick vector adapter produces the same shape
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. packages/motion/src/gestures/tilt.ts: createTiltDetector (PoseReading in, following aim.ts's
   structure): captures the first orientation as rest, computes roll (around forward/Y) and pitch
   (around right/X) of the current pose relative to rest via the device's own up-axis (matches
   motion.md "Tilt" section), maps degrees/25 to raw x/y, applies a shared createTiltOutput (radial
   0.15 dead zone rescaled to 0..1, rounded to 0.05, emits only on change) -- shared with the
   joystick fallback like createAimOutput/createSwingOutput. Holds the last value 200ms while linear
   acceleration exceeds 12 m/s^2 (shake/bump), reusing swing/flick's linearAcceleration pattern.
   createTiltSender (mirrors createAimSender exactly): streams through InputChannel.stream (AC#2),
   dedupes unchanged values, defaults input type "tilt".
2. packages/motion/src/fallbacks/tilt.ts: createTiltJoystick (mirrors createAimDrag): takes a
   {t,x,y} vector shaped like CcJoystick's nipplejs output (already right=+x, up=+y, -1..1) and
   applies the same createTiltOutput pipeline, so AC#3's adapter yields the identical Tilt shape.
   No import from @couchcade/ui (kit packages don't import each other per dependency-cruiser).
3. Wire both into gestures/index.ts and fallbacks/index.ts re-exports plus their doc comments.
4. packages/motion/test/tilt/: traces.ts (synthetic roll/pitch pose+gyro trace generator mirroring
   test/aim/traces.ts), detector.test.ts, sender.test.ts, joystick.test.ts covering dead zone,
   rescaling, rounding, change-only emission, the accel-hold, input.stream integration and the
   fallback producing the same shape/values as the motion detector for the same input.
5. Verify: pnpm check && pnpm test (plus build) before every commit.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test
Tune thresholds with traces from CC-5.9 when available.

Amended 2026-09-17 for the approved real-time link design (docs/architecture/realtime-link.md, owner approval of CC-3.12): tilt goes through input.stream so it gets direct-link rates, and the channel does the relay packing. Depends on CC-3.18.

Delivered: createTiltDetector/createTiltSender in packages/motion/src/gestures/tilt.ts (mirrors aim.ts's pattern precisely -- captures the first pose reading as rest, reads roll (around forward/Y) and pitch (around right/X) from the device's own up-axis relative to rest, 25 deg full scale, 0.15 radial dead zone rescaled to 0..1, rounded to 0.05, 200ms hold above 12 m/s^2 linear acceleration). createTiltSender streams through channel.stream (InputChannel), satisfying AC#2 explicitly -- verified end to end in test/tilt/sender.test.ts. createTiltJoystick in fallbacks/tilt.ts applies the same shared createTiltOutput dead-zone/round pipeline to a {t,x,y} vector shaped like CcJoystick's nipplejs output (right=+x, up=+y), producing the identical Tilt shape (AC#3), verified in test/tilt/joystick.test.ts's shape-equality test. No import from @couchcade/ui (kit packages don't import each other per .dependency-cruiser.cjs). 28 new tests in packages/motion/test/tilt/ (traces.ts synthetic roll/pitch generator mirroring test/aim/traces.ts's technique, detector.test.ts, joystick.test.ts, sender.test.ts). pnpm check, pnpm test (all 24 workspace projects) and pnpm build all green; pnpm check:deps clean.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Adds tilt steering to @couchcade/motion: createTiltDetector/createTiltSender (packages/motion/src/gestures/tilt.ts) emit a normalised x/y vector -- a 0.15 radial dead zone rescaled to 0..1, 25 deg full scale, rounded to 0.05, held for 200ms through a shake or bump -- and stream it through the game SDK InputChannel's input.stream (CC-3.18), not the CC-3.6 batching helper directly. createTiltJoystick (packages/motion/src/fallbacks/tilt.ts) applies the identical shared dead-zone/round pipeline to a nipplejs-shaped drag vector, producing the exact same shape as the motion detector, so a game can't tell which control the player used. Both mirror aim.ts's established pattern. 28 new tests in packages/motion/test/tilt/. Independent reviewer (dipsaus-ai:story-reviewer, sonnet): pass on round 1, all 3 acceptance criteria met, no scope violations.
<!-- SECTION:FINAL_SUMMARY:END -->
