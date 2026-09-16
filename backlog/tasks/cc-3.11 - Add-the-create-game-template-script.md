---
id: CC-3.11
title: Add the create-game template script
status: To Do
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 12:28'
labels:
  - story
dependencies:
  - CC-3.1
  - CC-1.13
references:
  - tooling/create-game/
parent_task_id: CC-3
type: chore
ordinal: 60000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A new game package is generated consistently in one command.

Type: deliverable
Branch: CC-3.11/create-game-template
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 pnpm create-game <id> "<Title>" creates games/<id> with package.json, src/host, src/controller, src/shared, src/index.ts and a contract test
- [ ] #2 The generated package passes pnpm check and pnpm test
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test
<!-- SECTION:NOTES:END -->
