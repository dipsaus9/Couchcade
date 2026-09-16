---
id: CC-1.15
title: 'Run registered games on the host: start, tick and broadcast controller state'
status: To Do
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 12:27'
labels:
  - story
dependencies:
  - CC-1.11
  - CC-1.13
references:
  - apps/host/src/runtime/
parent_task_id: CC-1
priority: high
type: feature
ordinal: 38000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The host can run any registered game from start to end and return to the lobby.

Type: deliverable
Branch: CC-1.15/host-game-runtime
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The first player (VIP) can start a game; until the menu exists (CC-3.2) the first registered game is used
- [ ] #2 onTick runs on a fixed 60 Hz timestep
- [ ] #3 Inputs failing the game inputSchema are dropped
- [ ] #4 controller:state is broadcast at most once per tick
- [ ] #5 When the game ends, host and phones return to the lobby
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test
<!-- SECTION:NOTES:END -->
