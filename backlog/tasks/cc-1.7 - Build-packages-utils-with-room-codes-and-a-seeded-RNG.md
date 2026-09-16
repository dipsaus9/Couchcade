---
id: CC-1.7
title: Build packages/utils with room codes and a seeded RNG
status: To Do
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 12:27'
labels:
  - story
dependencies:
  - CC-1.5
references:
  - packages/utils/
parent_task_id: CC-1
type: feature
ordinal: 30000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Pure helpers every package can use: room codes and deterministic randomness.

Type: deliverable
Branch: CC-1.7/utils-package
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 roomCode() returns 4 uppercase letters without ambiguous letters (I, O)
- [ ] #2 createRng(seed) returns the same sequence for the same seed (unit test)
- [ ] #3 package.json exports use a wildcard subpath pattern so later helpers need no package.json edits
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test
<!-- SECTION:NOTES:END -->
