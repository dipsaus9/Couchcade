---
id: CC-4.2
title: >-
  Build the theme package: tokens, CSS variables, Phaser colours and contrast
  tests
status: To Do
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 12:28'
labels:
  - story
dependencies:
  - CC-1.5
references:
  - packages/theme/package.json
  - packages/theme/src/tokens.ts
  - packages/theme/src/generate/
  - packages/theme/src/scenes/
  - packages/theme/test/
parent_task_id: CC-4
type: feature
ordinal: 62000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
One source of truth for colours, type, shape and motion tokens.

Type: deliverable
Branch: CC-4.2/theme-package
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 packages/theme exports the tokens from HOUSE_STYLE.md
- [ ] #2 toCssVars() and toPhaserColor() are generated and snapshot-tested
- [ ] #3 Scene palettes auto-register from packages/theme/src/scenes/*.ts (desert, alley and track included)
- [ ] #4 Every text/background pair passes WCAG AA in a test
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test
<!-- SECTION:NOTES:END -->
