---
id: CC-5.2
title: Build the sensor adapter with iOS permission flow and test injection
status: In Progress
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 22:27'
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
- [ ] #1 requestPermission() is only called from a user gesture and reports granted, denied or unsupported
- [ ] #2 Events pause when the page is hidden and resume when visible
- [ ] #3 The adapter can be replaced by a fake in tests
- [ ] #4 event.interval is exposed for diagnostics
- [ ] #5 package.json uses wildcard subpath exports
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
<!-- SECTION:NOTES:END -->
