---
id: CC-8.5
title: 'E2E test: play a three-game party with bots'
status: To Do
assignee: []
created_date: '2026-09-16 12:25'
updated_date: '2026-09-16 12:28'
labels:
  - story
dependencies:
  - CC-8.3
  - CC-8.4
  - CC-1.17
  - CC-10.6
  - CC-11.6
  - CC-15.6
references:
  - e2e/party.spec.ts
parent_task_id: CC-8
type: chore
ordinal: 97000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Party mode is proven end to end.

Type: deliverable
Branch: CC-8.5/party-e2e
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 e2e/party.spec.ts plays Quick Draw, Target Range and Double Top as a party with 3 bot phones and asserts the podium
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm e2e
<!-- SECTION:NOTES:END -->
