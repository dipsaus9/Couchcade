---
id: CC-1.13
title: 'Build the game SDK contract, auto-discovery registry and contract test kit'
status: To Do
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 12:27'
labels:
  - story
dependencies:
  - CC-1.1
  - CC-1.7
  - CC-1.8
references:
  - packages/game-sdk/package.json
  - packages/game-sdk/src/contract/
  - packages/game-sdk/src/registry/
  - packages/game-sdk/testing/
parent_task_id: CC-1
priority: high
type: feature
ordinal: 36000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Games plug in by existing in games/<id>; no shared registry file is ever edited.

Type: deliverable
Branch: CC-1.13/game-sdk-contract
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The CouchcadeGame type matches the contract in docs/architecture/platform.md
- [ ] #2 The registry discovers games/*/src/index.ts with import.meta.glob and needs no manual list
- [ ] #3 testGameContract(game) checks unique id, player bounds, seed-deterministic init and pure onPlayerInput
- [ ] #4 A fixture game in packages/game-sdk/testing/fixtures/ passes testGameContract
- [ ] #5 package.json uses wildcard subpath exports so later SDK modules need no package.json edits
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test
<!-- SECTION:NOTES:END -->
