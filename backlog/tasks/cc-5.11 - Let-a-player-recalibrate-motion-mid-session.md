---
id: CC-5.11
title: Let a player recalibrate motion mid-session
status: To Do
assignee: []
created_date: '2026-09-19 08:23'
labels:
  - story
dependencies: []
references:
  - apps/controller/src/motion/
  - apps/controller/src/screens/calibration/
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
- [ ] #1 A player can trigger a fresh calibration from inside a running motion game, without a full reload or leaving the room
- [ ] #2 Recalibrating doesn't lose the player's seat, score, or connection
<!-- AC:END -->
