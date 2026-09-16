---
id: CC-9.4
title: Add friendly error and offline screens
status: To Do
assignee: []
created_date: '2026-09-16 12:25'
updated_date: '2026-09-16 12:28'
labels:
  - story
dependencies:
  - CC-4.7
  - CC-4.8
references:
  - apps/host/src/errors/
  - apps/controller/src/errors/
parent_task_id: CC-9
type: feature
ordinal: 102000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Errors explain what happened and what to do next.

Type: deliverable
Branch: CC-9.4/friendly-error-screens
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Room not found, room full, quota reached (free limit hit), connection lost and offline each have a screen on phone and TV in the referee voice
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test
<!-- SECTION:NOTES:END -->
