---
id: CC-4.10
title: 'Implement check:style for colours, fonts, v-html and new Date in shared'
status: To Do
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 12:28'
labels:
  - story
dependencies:
  - CC-4.2
  - CC-1.5
references:
  - tooling/check-style/
parent_task_id: CC-4
type: chore
ordinal: 70000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
CI catches house style and determinism violations.

Type: deliverable
Branch: CC-4.10/style-checks
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 pnpm check:style fails on raw hex/rgb/hsl or font-family outside packages/theme
- [ ] #2 It fails on v-html in any .vue file
- [ ] #3 It fails on new Date( inside games/*/src/shared/
- [ ] #4 Each rule has a failing fixture test
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check:style
<!-- SECTION:NOTES:END -->
