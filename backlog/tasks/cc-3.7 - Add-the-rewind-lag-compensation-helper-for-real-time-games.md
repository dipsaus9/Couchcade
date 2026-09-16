---
id: CC-3.7
title: Add the rewind lag compensation helper for real-time games
status: To Do
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 12:27'
labels:
  - story
dependencies:
  - CC-3.1
  - CC-1.14
references:
  - packages/game-sdk/src/rewind/
parent_task_id: CC-3
type: feature
ordinal: 56000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Late inputs are applied at the moment the player acted.

Type: deliverable
Branch: CC-3.7/rewind-lag-compensation
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The helper keeps 200 ms of state history
- [ ] #2 An input with a host-time timestamp rewinds, applies and re-simulates, capped at 150 ms
- [ ] #3 A deterministic unit test proves the same final state as an on-time input
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test
<!-- SECTION:NOTES:END -->
