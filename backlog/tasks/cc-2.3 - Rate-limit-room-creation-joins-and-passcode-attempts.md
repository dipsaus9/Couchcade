---
id: CC-2.3
title: 'Rate-limit room creation, joins and passcode attempts'
status: To Do
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 15:58'
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
- [ ] #2 A test asserts the Durable Object is not invoked for rate-limited requests
- [ ] #3 More than 20 join attempts per IP per minute return 429 (owner decision 2026-09-16: every phone at a party shares one Wi-Fi IP)
- [ ] #4 More than 5 passcode attempts per IP per minute return 429 (every attempt counts, not only wrong ones, per docs/architecture/security.md)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test

Owner decisions 2026-09-16 (CC-2.1 security doc): join limit raised from 10 to 20 per IP per minute; the README's interactive challenge after 3 wrong codes is dropped. Per docs/architecture/security.md, the passcode limit counts every passcode attempt, not only wrong ones.
<!-- SECTION:NOTES:END -->
