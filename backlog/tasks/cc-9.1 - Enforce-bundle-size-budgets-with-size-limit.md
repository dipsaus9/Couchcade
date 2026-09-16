---
id: CC-9.1
title: Enforce bundle size budgets with size-limit
status: To Do
assignee: []
created_date: '2026-09-16 12:25'
updated_date: '2026-09-16 12:28'
labels:
  - story
dependencies:
  - CC-1.5
  - CC-1.11
  - CC-1.12
references:
  - .size-limit.json
  - tooling/budgets/
parent_task_id: CC-9
type: chore
ordinal: 99000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
CI fails when the phone or TV bundle grows past the README budgets.

Type: deliverable
Branch: CC-9.1/bundle-budgets
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 pnpm budgets checks controller initial JS ≤ 80 KB gzip, per-game controller chunk ≤ 25 KB, host platform JS ≤ 450 KB
- [ ] #2 The check runs in CI through the existing root script
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm budgets
<!-- SECTION:NOTES:END -->
