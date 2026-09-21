---
id: CC-5.11
title: Let a player recalibrate motion mid-session
status: In Progress
assignee: []
created_date: '2026-09-19 08:23'
updated_date: '2026-09-21 03:17'
labels:
  - story
dependencies:
  - CC-5.14
references:
  - apps/controller/src/motion/
  - apps/controller/src/screens/calibration/
  - apps/controller/src/App.vue
  - apps/controller/test/
parent_task_id: CC-5
type: feature
ordinal: 229000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Outcome: a player with a bad motion calibration can redo it without leaving the game or the room, instead of the game staying unplayable for them.

Type: deliverable
Branch: CC-5.11/recalibrate-motion

Reported during the CC-3.24 owner replay (2026-09-19): "if you calibrated your phone wrong it is unplayable after." No recalibration UI exists in apps/controller/src/motion/ today — the calibration screen only ever runs once per game start.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A player can trigger a fresh calibration from inside a running motion game, without a full reload or leaving the room
- [x] #2 Recalibrating doesn't lose the player's seat, score, or connection
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Add recalibrate() to MotionSession (session.ts): while flow.kind==='ready' && playing && !paused, reset the already-running RestCalibration (CC-5.14, motionRest) so the next quiet moment produces a guaranteed-fresh measurement, tracked as a transient recalibrating: {progress} field cleared once a fresh calibration lands or a give-up timeout passes. Add RecalibrateButton.vue (motion/) as a small fixed-position CcButton, mounted from App.vue (added to References) as an overlay sibling next to MotionResume, gated on the game being ready/playing/unpaused. No changes to packages/motion or the calibration screens folder (unrelated TV-lag calibration).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Per CC-5.12's owner-approved decision (docs/architecture/motion.md, 'Where aim's zero comes from'): once CC-5.14's continuous estimator lands, most bad-calibration cases self-correct within seconds, so this story shrinks to a manual 'fix my controls now' shortcut/fast-path rather than the only remedy. Build after CC-5.14, not before -- don't ship a button whose only job is a measurement the phone could take itself.
<!-- SECTION:NOTES:END -->
