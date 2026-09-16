---
id: CC-3.9
title: Build the deterministic physics package on Planck.js
status: To Do
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 12:28'
labels:
  - story
dependencies:
  - CC-3.1
  - CC-1.5
references:
  - packages/physics/
parent_task_id: CC-3
type: feature
ordinal: 58000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Physics games share one tested, deterministic 2D physics wrapper.

Type: deliverable
Branch: CC-3.9/physics-package
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 packages/physics wraps a Planck.js world with a fixed step
- [ ] #2 The same inputs produce the same final positions across runs (unit test)
- [ ] #3 Helpers exist for circle bodies, walls and friction
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test
<!-- SECTION:NOTES:END -->
