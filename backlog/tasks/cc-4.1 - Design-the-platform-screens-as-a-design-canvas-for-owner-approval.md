---
id: CC-4.1
title: Design the platform screens as a design canvas for owner approval
status: Done
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 15:12'
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
- [x] #1 A published design canvas has artboards for: TV join/lobby with QR and code, TV game menu, TV results, TV calibration, phone join, phone lobby, phone waiting, phone big action states, phone motion permission, phone errors, and a Pip parts sheet
- [x] #2 docs/design/platform-screens.md links the canvas and lists which house style tokens each screen uses
- [x] #3 Owner approval is recorded in the task notes as "Approved by owner: <YYYY-MM-DD>" before the story is Done
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Read HOUSE_STYLE, README and the CC-3/4/5/6/9 stories that define the screens.
2. Build one self-contained HTML design canvas outside the repo with TV (1920x1080), phone (390x844) and Pip sheet artboards, strictly on house style tokens.
3. Publish it as an artifact.
4. Write docs/design/platform-screens.md linking the canvas and listing the tokens per screen.
5. Review gate, push, draft PR; leave In Progress for owner approval.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Owner gate: open the docs PR, send the owner a short summary plus the PR link in chat, and wait for explicit approval. Merge only after approval; record it with --append-notes.

Canvas published: https://claude.ai/artifact/XEmb9sFHz2dVKYMVrKYZEz (source kept outside the repo, linked from docs/design/platform-screens.md).
Review (story-reviewer, round 1): pass. AC1 and AC2 met, no scope violations; AC3 pending the owner.
Advisory 1 (fixed): Ink 45% text failed AA for placeholders and waiting values. It is now used for disabled text only, and a proposed ink-70 tint (#60697F, about 5.3:1) covers the rest. Canvas republished as v3.
Advisory 2 (follow-up): after approval, consider saving a snapshot of the canvas HTML under docs/design/ so the approved design can't be lost if the artifact changes.

Approved by owner: 2026-09-16
Owner decisions (2026-09-16):
1. Jersey shape: every Pip jersey shows the player's shape in Chalk on the chest.
2. Tints: ink-20 (#CED2DB on Chalk, #78B1D2 on Sky), ink-45 (#979EAE, disabled text only) and ink-70 (#60697F) become theme tokens; CC-4.2 adds them.
3. Kick button: a 64px-high TV button for Kick on lobby cards.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Published the platform screens design canvas (https://claude.ai/artifact/XEmb9sFHz2dVKYMVrKYZEz). It has 29 artboards in the Clubhouse house style: TV join/lobby with QR and code, game menu, results and lag calibration; phone join, lobby, waiting, the 5 big action states, motion permission and 8 error screens; and a Pip parts sheet. docs/design/platform-screens.md links the canvas, lists the house style tokens per screen and records the owner's approval on 2026-09-16 with three decisions: the Chalk player shape on Pip jerseys, the ink-20/ink-45/ink-70 tints for CC-4.2, and a 64px TV Kick button.
<!-- SECTION:FINAL_SUMMARY:END -->
