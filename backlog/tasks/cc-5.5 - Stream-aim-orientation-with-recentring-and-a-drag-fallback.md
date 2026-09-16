---
id: CC-5.5
title: Stream aim orientation with recentring and a drag fallback
status: In Progress
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 23:08'
labels:
  - story
dependencies:
  - CC-5.3
  - CC-3.6
references:
  - packages/motion/src/gestures/aim.ts
  - packages/motion/src/fallbacks/aim.ts
  - packages/motion/test/aim/
  - packages/motion/src/gestures/index.ts
  - packages/motion/src/fallbacks/index.ts
  - packages/motion/package.json
  - packages/motion/test/exports.test.ts
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

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. packages/motion/src/gestures/aim.ts: createAimDetector (pure; reads the orientation of the controller's one pose tracker, aim.push(tracker.push(sample))): yaw = change in the top edge's heading around motion Z since the recentre point, pitch = change in its elevation; ±25°/±15° map to ±1, clamped, rounded to 2 decimals, emitted only on change; recentre(t?), mark({type: 'recentre'}), reset(), aim(), on(). createAimSender(stream): samples the latest reading at most every 66.7 ms (15 Hz, one timer, ceil delay), skips steps under 0.01, and calls the CC-3.6 stream's set with the rolling window of the latest 4 kept samples packed as aim: [[dtMs, yaw, pitch], ...] (packAim, dtMs integer offset from the newest, newest last, newest t as eventTimeStamp). Constants come from @couchcade/game-sdk/input.
2. packages/motion/src/fallbacks/aim.ts: createAimDrag over {t, x, y, type} pointer points, touchpad-style, 200 px across the yaw range and 150 px across pitch, same AimSource shape and readings.
3. gestures/index.ts and fallbacks/index.ts expose the new subpaths through the existing wildcard export. package.json gains @couchcade/game-sdk (workspace) in dependencies; test/exports.test.ts now asserts dependencies are workspace packages only (no npm).
4. Tests in packages/motion/test/aim/: synthetic physics traces (heading, elevation, roll) through calibration and the pose tracker; drag pointer paths; the sender on fake timers through the real createInputStream and host addAimSamples/aimAt.
5. Verify pnpm check, test, build, check:deps, check:style.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test
Tune thresholds with traces from CC-5.9 when available.

Amended 2026-09-16 (motion.md conflict 1): 15 Hz is the sampling rate; the platform budget allows at most 4 messages per second.

References amended (2026-09-17): added packages/motion/src/gestures/index.ts and packages/motion/src/fallbacks/index.ts (the wildcard export needs an index.ts per subpath, as the exports test says), packages/motion/package.json (the @couchcade/game-sdk workspace dependency for InputStream, AimSample and the aim constants; kit may import core) and packages/motion/test/exports.test.ts (its 'no dependencies' assertion now reads 'only workspace packages', keeping motion.md adapter rule 9's no-npm rule). pnpm-lock.yaml changes as implied bookkeeping.
Doc readings: (a) '200 CSS px of drag is the full yaw range' is read as 200 px crossing −1..1 (100 px from centre to an edge), same for 150 px pitch. (b) Samples are taken by the sender with a trailing-edge throttle so the final aim of a drag that stops between two samples still goes out; the detector stays pure (motion.md gesture rule 1) and the timer lives in the sender, like the CC-3.6 stream. (c) The detector reads PoseReading from the one per-controller tracker instead of raw samples, so swing, aim and flick never integrate twice.
<!-- SECTION:NOTES:END -->
