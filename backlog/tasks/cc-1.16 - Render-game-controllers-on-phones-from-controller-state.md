---
id: CC-1.16
title: Render game controllers on phones from controller state
status: To Do
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 16:20'
labels:
  - story
dependencies:
  - CC-1.12
  - CC-1.13
references:
  - apps/controller/src/runtime/
  - .dependency-cruiser.cjs
  - tooling/check-deps/
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
- [ ] #5 The phone registry uses createControllerRegistry over games/*/src/controller/index.ts (defineController) and never loads a game's src/index.ts (owner decision 2026-09-16)
- [ ] #6 .dependency-cruiser.cjs forbids anything under games/*/src/controller/ from reaching planck, @couchcade/physics or phaser (also through shared/), with a failing fixture test in tooling/check-deps
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test

Amended 2026-09-16 after the owner approved the session-flow doc (conflict 1): phones load a controller-only entry. See docs/architecture/platform.md 'How the phone shows a controller' and 'Auto-discovery registry'. If CC-1.13 did not add defineController/createControllerRegistry to @couchcade/game-sdk, add them here (packages/game-sdk/src/registry/).
<!-- SECTION:NOTES:END -->
