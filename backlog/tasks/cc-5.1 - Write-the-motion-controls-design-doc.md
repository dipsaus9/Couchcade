---
id: CC-5.1
title: Write the motion controls design doc
status: To Do
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 12:28'
labels:
  - story
  - owner-gate
dependencies:
  - CC-1.1
references:
  - docs/architecture/motion.md
parent_task_id: CC-5
type: docs
ordinal: 71000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
An approved sensor strategy and gesture event contracts.

Type: deliverable
Branch: CC-5.1/motion-design-doc
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 docs/architecture/motion.md covers sensor choice (devicemotion on both platforms, rotationRate first), iOS permission UX, calibration, safety (grip-hold), trace format
- [ ] #2 It defines event contracts with fields and units for swing, aim, flick, tilt and shake, plus the touch fallback for each
- [ ] #3 Owner approval is recorded in the task notes as "Approved by owner: <YYYY-MM-DD>" before the story is Done
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Owner gate: open the docs PR, send the owner a short summary plus the PR link in chat, and wait for explicit approval. Merge only after approval; record it with --append-notes.
<!-- SECTION:NOTES:END -->
