---
id: CC-3.15
title: Relay WebRTC signalling messages through the room
status: To Do
assignee: []
created_date: '2026-09-17 17:50'
updated_date: '2026-09-17 17:50'
labels:
  - story
dependencies:
  - CC-3.14
references:
  - packages/protocol/src/messages/
  - packages/protocol/test/messages.test.ts
  - apps/server/src/room/rtc.ts
  - apps/server/src/room/room.ts
  - apps/server/test/rtc.test.ts
  - apps/server/test/headers.test.ts
parent_task_id: CC-3
priority: high
type: feature
ordinal: 214000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Phones and the host can exchange rtc:offer and rtc:answer through the room, with protocol schemas for every link message (docs/architecture/realtime-link.md, Signalling and Channels).

Type: deliverable
Branch: CC-3.15/rtc-signalling-relay
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 @couchcade/protocol exports schemas for rtc:offer, rtc:answer, link:ping and link:pong, and input.d accepts optional n, e and more, with valid and invalid fixtures that encode under 1 KB
- [ ] #2 The room forwards rtc:offer only from a seated player to the host with from set, and drops it from audience and host sockets (apps/server/test/rtc.test.ts)
- [ ] #3 The room forwards rtc:answer only to the connected phone named in to, with to removed, and drops an unknown or disconnected target
- [ ] #4 A test asserts the room makes no storage write for rtc messages
- [ ] #5 A header test asserts the Content-Security-Policy never contains a webrtc 'block' directive
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check, pnpm test, pnpm build.
<!-- SECTION:NOTES:END -->
