---
id: CC-2.2
title: Add Turnstile checks to room creation and joining
status: To Do
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 12:27'
labels:
  - story
dependencies:
  - CC-2.1
  - CC-1.10
  - CC-1.11
  - CC-1.12
references:
  - apps/server/src/security/turnstile.ts
  - apps/server/src/api/
  - apps/host/src/security/
  - apps/controller/src/security/
parent_task_id: CC-2
type: feature
ordinal: 44000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Bots can't create or join rooms.

Type: deliverable
Branch: CC-2.2/turnstile-checks
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The API returns 403 for a missing or invalid Turnstile token
- [ ] #2 Host and controller render the invisible widget and use Cloudflare test keys in development
- [ ] #3 Tests use the dummy token XXXX.DUMMY.TOKEN.XXXX
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test
<!-- SECTION:NOTES:END -->
