---
id: CC-4.9
title: 'Build the CC0 asset pipeline: palette recolour, palette check and credits'
status: To Do
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 12:28'
labels:
  - story
dependencies:
  - CC-4.2
references:
  - tooling/assets/
  - docs/CREDITS.md
parent_task_id: CC-4
type: chore
ordinal: 69000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
CC0 sprites become on-palette, credited game assets in one command.

Type: deliverable
Branch: CC-4.9/cc0-asset-pipeline
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 pnpm assets:recolour <input> <scene> maps every pixel to the nearest colour of the core + scene palette
- [ ] #2 A palette check fails on off-palette sprites and on frame sizes that aren't multiples of the world grid
- [ ] #3 games/*/CREDITS.md entries (asset, author, source URL, licence) are validated and aggregated into docs/CREDITS.md
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test
<!-- SECTION:NOTES:END -->
