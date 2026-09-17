---
id: CC-6.1
title: 'Write the Pips spec: parts, data model and rendering'
status: In Progress
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-17 11:23'
labels:
  - story
  - owner-gate
dependencies:
  - CC-4.1
references:
  - docs/architecture/pips.md
parent_task_id: CC-6
type: docs
ordinal: 81000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
An approved Pip design based on the design canvas Pip sheet.

Type: deliverable
Branch: CC-6.1/pips-spec
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 docs/architecture/pips.md defines parts, the profile data model, persistence on the phone and both render forms
- [ ] #2 Owner approval is recorded in the task notes as "Approved by owner: <YYYY-MM-DD>" before the story is Done
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Read HOUSE_STYLE Pips, the approved canvas Pip sheet (pip/worldPip code), platform.md protocol, session-flow storage, security privacy, Quick Draw and Target Range world-pip placeholders, stage/ui/theme/protocol/server code and CC-6.2..6.6.
2. Publish a parts-sheet artifact (both forms, 8 example Pips, chest-emblem options) and link it.
3. Write docs/architecture/pips.md: decisions first, open owner questions with recommendations, parts with frozen indexes, profile data model (type, JSON, validation, wire sizes, extension rules), random defaults, phone persistence and privacy, Interface Pip, World Pip pixel spec, Pips on the TV, accessibility, budgets, which story builds what, discrepancies found.
4. Verify (pnpm check, test, build), review gate, push, draft PR, CI green. Leave In Progress for owner approval.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Owner gate: open the docs PR, send the owner a short summary plus the PR link in chat, and wait for explicit approval. Merge only after approval; record it with --append-notes.

Parts sheet artifact (both forms, 8 example Pips, chest options): https://claude.ai/artifact/EhifwbxiX6GNRUFzJ9CUYa
Verify: pnpm check, check:style, check:deps, test, build all green. pnpm budgets on main: controller 54.2/80 KB, host 412.8/450 KB.
Found while writing (listed in the spec): the room ignores the join body's profile and seats everyone as {0,0,0} (new server story proposed); CC-6.6 AC#1 says Phaser but the TV lobby is Vue; CC-6.3 should be CcPip and needs packages/theme/src/pips/ in References; CC-6.2 needs packages/protocol/src/shared/ to move pipPartCounts to utils; Quick Draw and Target Range placeholder World Pips need a swap story after CC-6.4.
Open owner questions: 1) World Pip chest: 2x2 mark + 9x9 shape at feet (recommended) vs 5x5 chest shape; 2) random Pip button 'Shuffle' (recommended) since 'Surprise me' is the VIP random game.

Review round 1: pass. AC1 met; AC2 pending the owner gate (expected). No scope violations. Advisory findings applied: only Quick Draw has a placeholder world-pip.ts on main (Target Range's is in CC-11.4, in flight), and a note that surprised World Pips keep 1px eyes. Advisory: record the owner's choices for open questions 1 and 2 in the spec on approval.
<!-- SECTION:NOTES:END -->
