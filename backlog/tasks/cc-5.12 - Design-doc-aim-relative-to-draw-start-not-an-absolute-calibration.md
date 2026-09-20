---
id: CC-5.12
title: 'Design doc: aim relative to draw start, not an absolute calibration'
status: In Progress
assignee: []
created_date: '2026-09-19 08:24'
updated_date: '2026-09-20 10:09'
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
- [ ] #2 Owner approval recorded on the doc
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Read motion.md in full plus the calibration/aim/swing code it describes. 2. Establish what calibration actually supplies (heading origin, up axis, gyro bias, gravity sign) and which of those a per-gesture recentre already cancels. 3. Write a new motion.md section 'Where aim's zero comes from (CC-5.12)': problem statement with Target Range's own numbers, options A (keep absolute) / B (relative only) / C (hybrid: keep the reference, drop the ceremony), the absolute-aiming cost, the CC-5.11 and Strike Night questions, a recommendation, and a pending owner-decision line. 4. Docs-only: no code change to motion, calibration or aiming. 5. Verify check/test/build, review gate, push, draft PR, leave In Progress for the owner.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Delivered as docs-only. New section 'Where aim's zero comes from (CC-5.12)' in docs/architecture/motion.md.

Key finding while reading the code: aim is ALREADY relative to the draw. games/target-range/src/controller/aim.ts calls source.recentre(t) in startDraw, and has since CC-11.3, the version played on 2026-09-19. The swing detector does the same at grip-down. So the origin was never the problem. Of the four things Calibration holds, frame.forward/right is a pure yaw offset that recentring cancels, frame.up self-repairs through the pose tracker's 2%-per-sample gravity correction, and the two that neither cancel nor repair are the gyroscope bias and the gravity sign. The bias is the culprit: 3 deg/s residual slides Target Range's crosshair 18 world px a second (33.3 deg maps to full scale at 6 px/deg), so a 1.5 s draw ends a far target's width off, every shot, in the same direction. Rest calibration's 5 s timeout carries on with a ZERO bias, which is the worst case and hits exactly the players who cannot hold still.

Options written up: A keep absolute, B relative only with no calibration, C hybrid (keep the Calibration object, replace the one-shot still second with a continuous still detector that re-estimates bias and sign all session, so the hold-still screen disappears for most players). Recommendation: C. Also answered the three questions the story implies: relative-only does cost absolute shot-to-shot aiming (Target Range already pays it; Double Top and Duck Season must not), CC-5.11 stays complementary but shrinks to a manual shortcut and should be built after the estimator, and Strike Night's swing needs no origin change because it already zeroes at grip-down and its thresholds are rate magnitudes that a few deg/s of bias cannot move (it does still need the sign).

Verify: pnpm check, check:style, check:deps, test and build all green on the branch.

Reviewer (dipsaus-ai:story-reviewer, haiku per the docs-only token rule), round 1: verdict pass. AC#1 met, AC#2 not met by design (owner-gate). No scope violations, no findings.

AC#2 is left unchecked and the status left In Progress on purpose: the doc carries an explicit 'Owner decision: ___ (pending)' line plus an 'Approved by / Date' line for the owner to fill in. Nothing in the new section is binding and no motion, calibration or aiming code was touched.
<!-- SECTION:NOTES:END -->
