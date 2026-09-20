---
id: CC-5.14
title: >-
  Continuously re-estimate motion calibration instead of a one-shot hold-still
  step
status: To Do
assignee: []
created_date: '2026-09-20 11:40'
labels:
  - story
dependencies:
  - CC-5.12
references:
  - packages/motion/src/calibration/rest.ts
  - packages/motion/src/calibration/signs.ts
  - apps/controller/src/motion/session.ts
  - packages/motion/test/calibration/
  - apps/controller/test/motion/
parent_task_id: CC-5
type: feature
ordinal: 237000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Outcome: motion aiming/swinging no longer relies on a single one-second hold-still measurement at the start of a game. Gyroscope bias and gravity sign are continuously re-estimated whenever the phone is naturally still (between shots, while the host talks), so a bad first measurement stops mattering within seconds instead of ruining the whole session -- and the hold-still screen disappears for most players, only appearing as a fallback when a phone never goes still.

Type: deliverable
Branch: CC-5.14/continuous-calibration

Owner-approved design: docs/architecture/motion.md's "Where aim's zero comes from (CC-5.12)" section, Recommendation, points 1-5 and 7. Approved 2026-09-20 (CC-5.12). Do NOT change point 6 (recentre cadence) -- Target Range keeps per-draw recentring; that's explicitly not part of this story.

Implementation shape per the doc's "What changes for existing games" table:
- packages/motion/src/calibration/rest.ts: replace the one-shot still detector with a continuous one that keeps watching all session and re-measures bias on every fresh still stretch. Keep the current API so callers don't change.
- packages/motion/src/calibration/signs.ts: detect gravity sign from the first sample outside the unclear band, and let a later clear sample correct it (rather than a dedicated one-second window).
- apps/controller/src/motion/session.ts: the hold-still screen becomes conditional -- only shown if the game wants to start and no still stretch has happened yet.
- Never run with a zero bias: prefer a short noisy estimate over none.

This story does NOT touch games/target-range/src/controller/aim.ts (recentre cadence, point 6) or packages/motion/src/gestures/swing.ts (doc explicitly says no change needed there). CC-5.11 (manual recalibration escape hatch) should be built AFTER this lands, per the doc's ordering note -- do not merge/reorder ahead of it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A continuous still detector in packages/motion/src/calibration/rest.ts replaces the one-shot version, re-measuring bias on every fresh still stretch during a session, while keeping the existing public API
- [ ] #2 Gravity sign detection in signs.ts uses the first sufficiently-clear sample and can be corrected by a later one, instead of only the original still-second window
- [ ] #3 apps/controller/src/motion/session.ts only shows the hold-still screen when no still stretch has happened yet by the time the game wants to start
- [ ] #4 The system never runs with a zero/unmeasured bias -- a short noisy estimate is always preferred over none
<!-- AC:END -->
