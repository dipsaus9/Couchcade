---
id: CC-2.2
title: Add Turnstile checks to room creation and joining
status: To Do
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-17 09:02'
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
  - tooling/smoke/
  - .github/workflows/deploy.yml
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
- [ ] #4 POST /api/rooms with an x-cc-smoke header matching the SMOKE_TOKEN Worker secret (constant-time compare) skips only Turnstile; Origin, rate limits and the passcode still apply, and a wrong or missing smoke token falls back to the normal Turnstile check (security.md decision 19)
- [ ] #5 tooling/smoke sends x-cc-smoke from a SMOKE_TOKEN env var and .github/workflows/deploy.yml passes it from the SMOKE_TOKEN GitHub secret, so the live smoke test still creates a room once Turnstile is on
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test

Amended 2026-09-17 (owner decision: smoke token, security.md decision 19). Owner actions to write as steps: create the Turnstile widget (Invisible, hostname couchcade.dipsaus9.workers.dev) and set TURNSTILE_SECRET_KEY as a Worker SECRET; generate SMOKE_TOKEN (openssl rand -base64 32) and set it both as a Worker secret and as a GitHub Actions secret. Deploy order: secrets first, then merge.
<!-- SECTION:NOTES:END -->
