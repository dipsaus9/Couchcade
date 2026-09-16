---
id: CC-3.1
title: Write the session flow and SDK extensions design doc
status: In Progress
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 16:12'
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
- [x] #1 docs/architecture/session-flow.md covers each topic in the outcome with sequence diagrams for reconnect and host-refresh recovery
- [x] #2 Input batching rates use the CC-1.4 measurement when available, else 15 msg/s
- [ ] #3 Owner approval is recorded in the task notes as "Approved by owner: <YYYY-MM-DD>" before the story is Done
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Write docs/architecture/session-flow.md: decisions table and owner forks first, then binding sections per CC-3.x story (phases, menu, results, audience, phone reconnect and host recovery with sequence diagrams, input batching at the CC-1.4 rate of 4/s, rewind, calibration, physics, create-game template), party mode hooks, budget check, platform.md conflicts found. Reference platform.md and security.md instead of repeating them. Verify with pnpm check/test/build, independent review, draft PR, leave In Progress for owner approval.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Owner gate: open the docs PR, send the owner a short summary plus the PR link in chat, and wait for explicit approval. Merge only after approval; record it with --append-notes.

Review gate (dipsaus-ai:story-reviewer, round 1): pass. AC1 and AC2 met, no scope violations, no findings. AC3 is the owner gate and stays open until the owner approves the PR.
<!-- SECTION:NOTES:END -->
