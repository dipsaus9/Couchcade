---
id: CC-4.1
title: Design the platform screens as a design canvas for owner approval
status: To Do
assignee: []
created_date: '2026-09-16 12:24'
labels:
  - story
  - owner-gate
dependencies: []
references:
  - docs/design/platform-screens.md
parent_task_id: CC-4
priority: high
type: docs
ordinal: 61000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
An interactive design canvas the owner approves before any styled screen is built.

Type: deliverable
Branch: CC-4.1/platform-screens-design
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A published design canvas has artboards for: TV join/lobby with QR and code, TV game menu, TV results, TV calibration, phone join, phone lobby, phone waiting, phone big action states, phone motion permission, phone errors, and a Pip parts sheet
- [ ] #2 docs/design/platform-screens.md links the canvas and lists which house style tokens each screen uses
- [ ] #3 Owner approval is recorded in the task notes as "Approved by owner: <YYYY-MM-DD>" before the story is Done
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Owner gate: open the docs PR, send the owner a short summary plus the PR link in chat, and wait for explicit approval. Merge only after approval; record it with --append-notes.
<!-- SECTION:NOTES:END -->
