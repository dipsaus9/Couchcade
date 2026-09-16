---
id: CC-1.19
title: Enforce import boundaries with dependency-cruiser
status: To Do
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 12:27'
labels:
  - story
dependencies:
  - CC-1.5
references:
  - .dependency-cruiser.cjs
  - tooling/check-deps/
parent_task_id: CC-1
type: chore
ordinal: 42000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
CI fails when a package or game breaks the dependency direction.

Type: deliverable
Branch: CC-1.19/import-boundaries
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Rules enforce: apps → games → stage/ui/game-sdk/motion/audio/physics → theme/protocol → utils; games never import other games; nothing imports apps
- [ ] #2 pnpm check:deps fails on a violating fixture and passes on the repo
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check:deps
<!-- SECTION:NOTES:END -->
