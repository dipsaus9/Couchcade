---
id: CC-1.16
title: Render game controllers on phones from controller state
status: To Do
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 12:27'
labels:
  - story
dependencies:
  - CC-1.12
  - CC-1.13
references:
  - apps/controller/src/runtime/
parent_task_id: CC-1
priority: high
type: feature
ordinal: 39000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Phones show the right game controller and send inputs for it.

Type: deliverable
Branch: CC-1.16/controller-game-runtime
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The phone lazy-loads the controller component of the running game by id
- [ ] #2 controller:state data is passed to the component
- [ ] #3 Inputs go through one send helper
- [ ] #4 An unknown game id shows a friendly error in the referee voice
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test
<!-- SECTION:NOTES:END -->
