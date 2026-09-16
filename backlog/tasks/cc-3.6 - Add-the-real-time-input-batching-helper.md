---
id: CC-3.6
title: Add the real-time input batching helper
status: To Do
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 12:27'
labels:
  - story
dependencies:
  - CC-3.1
  - CC-1.13
references:
  - packages/game-sdk/src/input/
parent_task_id: CC-3
type: feature
ordinal: 55000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Phones send only changed input at a capped rate, protecting the request budget.

Type: deliverable
Branch: CC-3.6/input-batching-helper
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The helper sends only when the value changed and never faster than the configured rate
- [ ] #2 Release/fire events flush immediately
- [ ] #3 Unit tests with fake timers prove the cap
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test
<!-- SECTION:NOTES:END -->
