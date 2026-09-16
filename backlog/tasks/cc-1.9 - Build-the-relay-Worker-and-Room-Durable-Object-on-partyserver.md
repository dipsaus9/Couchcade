---
id: CC-1.9
title: Build the relay Worker and Room Durable Object on partyserver
status: To Do
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 12:27'
labels:
  - story
dependencies:
  - CC-1.1
  - CC-1.3
  - CC-1.7
  - CC-1.8
references:
  - apps/server/package.json
  - apps/server/wrangler.jsonc
  - apps/server/src/worker.ts
  - apps/server/src/room/
  - apps/server/test/
parent_task_id: CC-1
priority: high
type: feature
ordinal: 32000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A hibernating room relay that forwards input from phones to the host and controller state from the host to phones.

Type: deliverable
Branch: CC-1.9/relay-room-object
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The Room Durable Object extends partyserver and accepts sockets with the Hibernation API
- [ ] #2 Phone input is forwarded only to the host; host controller:state is forwarded only to the targeted phones
- [ ] #3 player:joined and player:left are sent to the host
- [ ] #4 The Durable Object uses no setTimeout or setInterval (grep check in test); idle rooms expire through an alarm after 30 minutes
- [ ] #5 Rooms are created with locationHint "weur" and wrangler.jsonc declares the Durable Object and rate limit bindings
- [ ] #6 Tests with @cloudflare/vitest-plugin cover join, forward and leave
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test
<!-- SECTION:NOTES:END -->
