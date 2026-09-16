---
id: CC-1.10
title: Add the room API with host passcode and signed join tickets
status: To Do
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 12:27'
labels:
  - story
dependencies:
  - CC-1.9
references:
  - apps/server/src/api/
  - apps/server/src/security/tickets.ts
  - apps/server/src/worker.ts
  - apps/server/.dev.vars.example
parent_task_id: CC-1
priority: high
type: feature
ordinal: 33000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Only people with the host passcode can create rooms, and every WebSocket needs a short-lived signed ticket.

Type: deliverable
Branch: CC-1.10/rooms-api-passcode
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 POST /api/rooms returns 401 without the correct HOST_PASSCODE and otherwise returns a room code and a host ticket
- [ ] #2 POST /api/rooms/:code/join returns a player ticket when the room exists and 404 otherwise
- [ ] #3 WebSocket upgrades without a valid HMAC ticket (60 s expiry, bound to room and role) are rejected before the Durable Object is called
- [ ] #4 apps/server/.dev.vars.example lists HOST_PASSCODE, TICKET_SIGNING_SECRET and TURNSTILE_SECRET_KEY with local test values
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test
<!-- SECTION:NOTES:END -->
