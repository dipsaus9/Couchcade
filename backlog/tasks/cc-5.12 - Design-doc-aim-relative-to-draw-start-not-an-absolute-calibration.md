---
id: CC-5.12
title: 'Design doc: aim relative to draw start, not an absolute calibration'
status: To Do
assignee: []
created_date: '2026-09-19 08:24'
updated_date: '2026-09-19 08:24'
labels:
  - story
  - owner-gate
dependencies: []
references:
  - docs/architecture/motion.md
parent_task_id: CC-5
type: docs
ordinal: 230000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Outcome: a written, owner-approved decision on whether motion aiming should track relative to where each draw/swing started, instead of an absolute origin fixed at calibration time, so a slightly-off calibration doesn't ruin the whole game.

Type: deliverable
Branch: CC-5.12/relative-aim-design

Owner suggestion during the CC-3.24 replay (2026-09-19): "Movement should always be relative to when you start drawing, calibration should not happen I think." This changes the shared motion/calibration model (docs/architecture/motion.md) used by every aiming game (Target Range today, more later), so it needs a design decision before any implementation, not a quiet code change.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 docs/architecture/motion.md records a decision: keep absolute calibration, switch to relative-to-draw-start aiming, or a hybrid, with the reasoning and what changes for existing games
- [ ] #2 Owner approval recorded on the doc
<!-- AC:END -->
