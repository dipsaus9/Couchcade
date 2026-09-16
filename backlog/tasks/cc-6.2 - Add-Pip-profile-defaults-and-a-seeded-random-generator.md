---
id: CC-6.2
title: Add Pip profile defaults and a seeded random generator
status: To Do
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 12:28'
labels:
  - story
dependencies:
  - CC-6.1
  - CC-1.7
  - CC-1.8
references:
  - packages/utils/src/pips/
parent_task_id: CC-6
type: feature
ordinal: 82000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Every player gets a valid random Pip.

Type: deliverable
Branch: CC-6.2/pip-generator
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 randomPip(seed) returns a valid profile for the protocol schema
- [ ] #2 Unit tests cover every part range
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test
<!-- SECTION:NOTES:END -->
