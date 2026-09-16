---
id: CC-6.6
title: Show Pips in the TV lobby and scoreboard
status: To Do
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 12:28'
labels:
  - story
dependencies:
  - CC-6.4
  - CC-4.7
references:
  - apps/host/src/screens/lobby/
  - packages/stage/src/scoreboard/
parent_task_id: CC-6
type: feature
ordinal: 86000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The TV shows everyone's Pip.

Type: deliverable
Branch: CC-6.6/pips-on-tv
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The TV lobby shows each player's Interface Pip rendered in Phaser
- [ ] #2 The stage scoreboard chips include the Pip head
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test
<!-- SECTION:NOTES:END -->
