---
id: CC-6.4
title: Build World Pip sprites for Phaser
status: To Do
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 12:28'
labels:
  - story
dependencies:
  - CC-6.2
  - CC-4.6
references:
  - packages/stage/src/pips/
parent_task_id: CC-6
type: feature
ordinal: 84000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Games can place a player's Pip in a pixel world.

Type: deliverable
Branch: CC-6.4/world-pip-sprites
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 buildWorldPip(profile) produces a 16×24 texture with 1px Ink outline from palette-indexed part data
- [ ] #2 Neutral, happy, surprised and sad expressions exist
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test
<!-- SECTION:NOTES:END -->
