---
id: CC-3.1
title: Write the session flow and SDK extensions design doc
status: To Do
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 12:27'
labels:
  - story
  - owner-gate
dependencies:
  - CC-1.1
references:
  - docs/architecture/session-flow.md
parent_task_id: CC-3
type: docs
ordinal: 50000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
An approved design for menu, results, reconnect, recovery, input batching, lag compensation, calibration, physics, audience and the game template.

Type: deliverable
Branch: CC-3.1/session-flow-doc
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 docs/architecture/session-flow.md covers each topic in the outcome with sequence diagrams for reconnect and host-refresh recovery
- [ ] #2 Input batching rates use the CC-1.4 measurement when available, else 15 msg/s
- [ ] #3 Owner approval is recorded in the task notes as "Approved by owner: <YYYY-MM-DD>" before the story is Done
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Owner gate: open the docs PR, send the owner a short summary plus the PR link in chat, and wait for explicit approval. Merge only after approval; record it with --append-notes.
<!-- SECTION:NOTES:END -->
