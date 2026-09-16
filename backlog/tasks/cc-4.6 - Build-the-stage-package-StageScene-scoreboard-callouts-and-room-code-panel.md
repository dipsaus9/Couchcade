---
id: CC-4.6
title: 'Build the stage package: StageScene, scoreboard, callouts and room code panel'
status: To Do
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 12:28'
labels:
  - story
dependencies:
  - CC-4.1
  - CC-4.2
  - CC-1.13
references:
  - packages/stage/
parent_task_id: CC-4
type: feature
ordinal: 66000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Games never draw their own TV interface.

Type: deliverable
Branch: CC-4.6/stage-package
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 StageScene owns an overlay layer above the game world
- [ ] #2 The scoreboard shows player chips with shapes in join order and highlights the active player
- [ ] #3 Callouts follow the house style treatment with a reduced-motion variant
- [ ] #4 The room code panel sits bottom-right inside the 5% safe area
- [ ] #5 A headless boot test renders each component
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test
<!-- SECTION:NOTES:END -->
