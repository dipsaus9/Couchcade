---
id: CC-2.3
title: 'Rate-limit room creation, joins and passcode attempts'
status: To Do
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 12:27'
labels:
  - story
dependencies:
  - CC-2.2
references:
  - apps/server/src/security/rate-limits.ts
  - apps/server/src/api/
parent_task_id: CC-2
type: feature
ordinal: 45000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Abuse is rejected in the Worker before a Durable Object is called.

Type: deliverable
Branch: CC-2.3/api-rate-limits
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 More than 3 room creations per IP per minute return 429
- [ ] #2 More than 10 join attempts per IP per minute return 429
- [ ] #3 More than 5 wrong passcodes per IP per minute return 429
- [ ] #4 A test asserts the Durable Object is not invoked for rate-limited requests
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test
<!-- SECTION:NOTES:END -->
