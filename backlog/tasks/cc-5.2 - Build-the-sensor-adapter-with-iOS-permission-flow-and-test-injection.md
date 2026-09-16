---
id: CC-5.2
title: Build the sensor adapter with iOS permission flow and test injection
status: Done
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 22:35'
labels:
  - story
dependencies:
  - CC-5.1
  - CC-1.5
references:
  - packages/motion/package.json
  - packages/motion/src/sensors/
  - packages/motion/src/index.ts
  - packages/motion/tsconfig.json
  - packages/motion/vitest.config.ts
  - packages/motion/test/sensors/
  - packages/motion/test/exports.test.ts
parent_task_id: CC-5
type: feature
ordinal: 72000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
One motion API for iPhone and Android that tests can replace.

Type: deliverable
Branch: CC-5.2/sensor-adapter
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 requestPermission() is only called from a user gesture and reports granted, denied or unsupported
- [x] #2 Events pause when the page is hidden and resume when visible
- [x] #3 The adapter can be replaced by a fake in tests
- [x] #4 event.interval is exposed for diagnostics
- [x] #5 package.json uses wildcard subpath exports
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Scaffold packages/motion (kit tier, no npm deps): package.json with wildcard subpath exports, tsconfig on the DOM base, vitest config, src/index.ts re-exporting sensors.
2. src/sensors/: types (MotionSample, MotionPermission, MotionCapability, MotionAdapter), normalise (NaN to null, capability per sample), browser adapter over an injectable env (window target, document visibility, DeviceMotionEvent, secure context, user activation), one devicemotion listener fanned out, pause on hidden and resume through the resume tap's start() per motion.md rule 5, waitForCapability (1 s), trace v1 reader, fake adapter (setPermission, push, play) matching the e2e window.__couchcadeMotion contract, synthetic trace builders.
3. Unit tests in test/sensors/ with a fake window, fake document visibility and fake timers; test/exports.test.ts for the export map.
4. Verify pnpm check, test, build, check:deps, check:style.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test

Scaffolding implied by the new package (tsconfig.json, vitest.config.ts, src/index.ts, test/sensors/, test/exports.test.ts) was added to References with exact paths. pnpm-lock.yaml changed only for the new workspace package.
AC2 follows motion.md adapter rule 5: on hidden the adapter removes its devicemotion listener and keeps the started listeners; it doesn't re-add it by itself. Once visible, the Tap to resume handler calls request() and start(), which resumes every started listener (starting the same listener twice doesn't duplicate it).
AC1: request() calls DeviceMotionEvent.requestPermission() synchronously (no await first), nothing else calls it, and where navigator.userActivation exists and isn't active it isn't called at all (reports unsupported, same as the browser's NotAllowedError would).
E2E hook: createFakeAdapter() fits the window.__couchcadeMotion adapter shape from e2e/src/motion.ts (setPermission, push, play(trace, { speed })); fake.test.ts assigns it to that shape without a cast. No change to the e2e contract was needed.
Also shipped per motion.md: waitForCapability (1 s real-data check), trace v1 reader traceSamples, synthetic.still and synthetic.swing (motion.md test layer 1 names CC-5.2 for these).

Review round 1: pass. All 5 criteria met, no scope violations. Advisory: a second start() of the same listener returned a separate stop() that aliased the first; fixed so start() returns the same stop() for a listener already started (test added).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added @couchcade/motion (kit tier, no npm dependencies) with the sensors module from motion.md. createBrowserAdapter reads one devicemotion listener and fans samples out. request() calls DeviceMotionEvent.requestPermission() synchronously inside the tap, never outside a user gesture, and reports granted, denied or unsupported (no DeviceMotionEvent, insecure page, a throw or rejection). When the page is hidden it pauses, and once visible the Tap to resume start() resumes it (rule 5). Samples expose t, interval (for diagnostics), acceleration, gravityAcceleration and rotationRate as delivered, with NaN as null, and capability() reports full, accelerometer or none. waitForCapability does the 1 s real-data check. createFakeAdapter (setPermission, push, play) replaces the adapter in tests and fits the e2e window.__couchcadeMotion hook without changes. The version 1 trace reader and synthetic.still/swing builders are included. Package exports use the wildcard subpath pattern. 48 unit tests use a fake window, fake document visibility and fake timers.
<!-- SECTION:FINAL_SUMMARY:END -->
