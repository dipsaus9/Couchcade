---
id: CC-1.18
title: Add the deploy workflow with a live smoke test
status: To Do
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 12:27'
labels:
  - story
  - needs-info
dependencies:
  - CC-1.6
  - CC-1.10
  - CC-1.11
  - CC-1.12
references:
  - .github/workflows/deploy.yml
  - tooling/smoke/
parent_task_id: CC-1
priority: high
type: chore
ordinal: 41000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Every merge to main deploys to workers.dev and proves a room can be created.

Type: deliverable
Branch: CC-1.18/deploy-workflow
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 .github/workflows/deploy.yml runs on push to main after CI succeeds and deploys with cloudflare/wrangler-action
- [ ] #2 tooling/smoke/ creates a room with the passcode through the API and opens a WebSocket
- [ ] #3 A failing smoke test fails the workflow
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Needs owner action: first manual `pnpm run deploy`, Worker secrets set, GitHub secrets CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, SMOKE_HOST_PASSCODE. Remove needs-info once confirmed.
<!-- SECTION:NOTES:END -->
