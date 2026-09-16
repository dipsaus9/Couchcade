---
id: CC-2.7
title: Serve strict security headers and CSP from the Worker
status: To Do
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 12:27'
labels:
  - story
dependencies:
  - CC-2.1
  - CC-1.10
references:
  - apps/server/src/security/headers.ts
  - apps/server/src/worker.ts
parent_task_id: CC-2
type: feature
ordinal: 49000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Pages ship the README's security headers.

Type: deliverable
Branch: CC-2.7/security-headers
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 HTML and asset responses carry the CSP, HSTS, nosniff, Referrer-Policy, COOP and Permissions-Policy from the README
- [ ] #2 The CSP allows challenges.cloudflare.com for Turnstile
- [ ] #3 A test asserts every header
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test
<!-- SECTION:NOTES:END -->
