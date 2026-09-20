---
id: CC-5.12
title: 'Design doc: aim relative to draw start, not an absolute calibration'
status: Done
assignee: []
created_date: '2026-09-19 08:24'
updated_date: '2026-09-20 11:39'
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
- [x] #1 docs/architecture/motion.md records a decision: keep absolute calibration, switch to relative-to-draw-start aiming, or a hybrid, with the reasoning and what changes for existing games
- [x] #2 Owner approval recorded on the doc
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Read motion.md in full plus the calibration/aim/swing code it describes. 2. Establish what calibration actually supplies (heading origin, up axis, gyro bias, gravity sign) and which of those a per-gesture recentre already cancels. 3. Write a new motion.md section 'Where aim's zero comes from (CC-5.12)': problem statement with Target Range's own numbers, options A (keep absolute) / B (relative only) / C (hybrid: keep the reference, drop the ceremony), the absolute-aiming cost, the CC-5.11 and Strike Night questions, a recommendation, and a pending owner-decision line. 4. Docs-only: no code change to motion, calibration or aiming. 5. Verify check/test/build, review gate, push, draft PR, leave In Progress for the owner.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Owner approved option C in full (continuous still-detector bias/sign re-estimation, hold-still screen becomes fallback-only) on 2026-09-20. Target Range keeps per-draw recentring for now; per-volley (recommendation point 6) not approved, revisit after playtesting the estimator. Decision recorded in docs/architecture/motion.md's 'Where aim's zero comes from (CC-5.12)' section. Follow-up implementation story to be filed separately for the continuous estimator (packages/motion/src/calibration/rest.ts, signs.ts, apps/controller/src/motion/session.ts's conditional hold-still screen) and a small one for the touch-drag fallback to follow the same recentre moments as motion.
<!-- SECTION:NOTES:END -->
