---
id: CC-5.14
title: >-
  Continuously re-estimate motion calibration instead of a one-shot hold-still
  step
status: In Progress
assignee: []
created_date: '2026-09-20 11:40'
updated_date: '2026-09-20 12:10'
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
- [x] #1 A continuous still detector in packages/motion/src/calibration/rest.ts replaces the one-shot version, re-measuring bias on every fresh still stretch during a session, while keeping the existing public API
- [x] #2 Gravity sign detection in signs.ts uses the first sufficiently-clear sample and can be corrected by a later one, instead of only the original still-second window
- [x] #3 apps/controller/src/motion/session.ts only shows the hold-still screen when no still stretch has happened yet by the time the game wants to start
- [x] #4 The system never runs with a zero/unmeasured bias -- a short noisy estimate is always preferred over none
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. rest.ts: replace the one-shot lock with a continuous estimator (same stillness test: rotation
   <10deg/s, gravity magnitude steady within 0.5 m/s^2). Keeps push/progress/reset API. Every fresh
   still stretch (>=1000ms) re-measures bias+up and flips a new `calibrated` progress flag. Before
   any still stretch, a 5s-timeout fallback (recent 250ms window average, never zero bias) keeps
   push() from blocking forever on a shaky hand -- this is the "5-second timeout that currently
   falls back to a zero bias" the doc says must never happen again.
2. signs.ts: add createSignTracker -- a tiny stateful wrapper around the existing pure detectSigns,
   fed one gravity reading at a time (still or moving), so the sign is set from the first clear
   sample and corrected by any later clear one, no dedicated window. rest.ts uses it instead of
   averaging a still window's gravity for the sign.
3. session.ts: start the still detector as soon as request() resolves granted, concurrently with
   the up-to-1s real-data wait -- most players are already holding still then, so a still stretch
   (or the never-zero fallback) is often already available by the time the game wants to start
   (right after the data check resolves and the host is waiting on this phone's motion:status).
   Skip the hold-still screen entirely in that case; only show it, as a fallback, when nothing is
   available yet -- then keep the same listener running until push() returns non-null.
4. Tests: rewrite packages/motion/test/calibration/rest.test.ts for the continuous estimator
   (multiple still stretches update the bias, calibrated flag, never-zero timeout fallback, still
   returns null before any estimate). Add sign-tracker coverage to signs.test.ts (first clear
   sample sets it, later clear sample corrects it). Rewrite apps/controller/test/motion/session.test.ts
   for the conditional hold-still screen (skips when already still during the data wait, still shows
   and blocks-then-proceeds as fallback otherwise), keeping every unrelated existing case green.
5. Verify (pnpm check, check:style, check:deps, test, build), reviewer gate (sonnet), push, draft PR.
Out of scope (left untouched, confirmed against References): docs/architecture/motion.md,
games/target-range/src/controller/aim.ts (recentre cadence, point 6), packages/motion/src/gestures/
swing.ts, packages/motion/src/calibration/{types,frame,pose,vector}.ts, index.ts.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented per motion.md's approved 'Where aim's zero comes from (CC-5.12)' recommendation,
points 1-5 and 7 (point 6, recentre cadence, untouched -- Target Range keeps per-draw recentring).

rest.ts: createRestCalibration is now continuous. Same stillness test (rotation <10deg/s, gravity
magnitude steady within 0.5 m/s^2). push()/progress()/reset() API unchanged. Every fresh still
stretch (>=1000ms) re-measures bias+up and sets progress().calibrated=true (new field). Before any
still stretch completes, a 5s-timeout fallback (mean of the most recent 250ms) is used instead of
blocking forever -- fixed to use the real (possibly noisy) rate mean instead of the old hardcoded
zero bias, so the system never hands off a zero/unmeasured bias with a gyroscope present
(accelerometer-only phones still correctly report a zero bias -- there's nothing to measure there).

signs.ts: added createSignTracker, a small stateful wrapper around the existing pure detectSigns,
fed one gravity reading per sample (still or moving). The first sample outside the unclear band
sets the decision; a later clear sample corrects it. rest.ts calls it on every sample instead of
averaging one still window's gravity for the sign.

session.ts: the still-detector listener now starts as soon as request() resolves granted, running
concurrently with the up-to-1s real-data wait. If a still stretch (or the never-zero fallback) is
already available once that wait resolves -- the moment the host is waiting on this phone's
motion:status, i.e. "the game wants to start" -- the hold-still screen is skipped entirely and the
phone goes straight to ready. It only shows as a fallback when nothing is available yet, and then
behaves as before (progress ring, proceeds once push() returns non-null).

Tests: rewrote rest.test.ts (multiple fresh still stretches update the bias across a simulated
session, never-zero-bias guarantee including the old zero-bias timeout bug, sign correction from a
later sample propagating into a real calibration) and added createSignTracker coverage to
signs.test.ts. Rewrote/extended session.test.ts for the conditional screen (skips when already
still during the data wait; shows as fallback and proceeds once calibrated; never hands off a zero
bias even from the fallback's own internal timeout) -- every pre-existing case still passes
unmodified.

Verified: calibrateRest's other callers (games/target-range and games/strike-night test helpers,
apps/controller/test/runtime/controller.test.ts -- all outside this story's References) are
unaffected: they use noiseless synthetic still traces where the immediate provisional estimate is
numerically identical to the old one-shot window average.

Sequencing note: CC-5.12 (the design doc) merged to main (PR #153) mid-delivery; this story was
implemented against its approved content.
<!-- SECTION:NOTES:END -->
