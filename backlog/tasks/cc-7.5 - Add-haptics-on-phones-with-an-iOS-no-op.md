---
id: CC-7.5
title: Add haptics on phones with an iOS no-op
status: To Do
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 12:28'
labels:
  - story
dependencies:
  - CC-7.1
  - CC-4.4
references:
  - packages/ui/src/haptics/
parent_task_id: CC-7
type: feature
ordinal: 91000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Android phones buzz on key moments.

Type: deliverable
Branch: CC-7.5/phone-haptics
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 haptic("your-turn") etc. call navigator.vibrate when available and do nothing otherwise
- [ ] #2 Unit test covers the no-vibrate path
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test
<!-- SECTION:NOTES:END -->
