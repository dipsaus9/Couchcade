---
id: CC-1.3
title: 'Spike: prove app WebSockets through the Cloudflare Vite plugin dev server'
status: To Do
assignee: []
created_date: '2026-09-16 12:24'
labels:
  - story
dependencies: []
references:
  - spikes/dev-websocket/
parent_task_id: CC-1
priority: high
type: spike
ordinal: 26000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A recorded decision on how local development serves WebSockets to the Room Durable Object.
Justification: open issue workers-sdk#15654 (2026-09-15) reports the dev server closing non-Vite sockets; only running it settles this.

Type: spike
Branch: CC-1.3/dev-server-websockets
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A throwaway prototype in spikes/dev-websocket/ exchanges 100 messages between a host page and a phone page through a Durable Object on the local dev server, or the failure is reproduced
- [ ] #2 The decision (Vite plugin dev server, or wrangler dev behind a Vite proxy) is recorded in the final summary with evidence
<!-- AC:END -->
