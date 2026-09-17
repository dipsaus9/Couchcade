---
id: CC-3.23
title: Skip periodic relay clock samples while a phone is on the direct link
status: To Do
assignee: []
created_date: '2026-09-17 17:51'
updated_date: '2026-09-17 17:51'
labels:
  - story
dependencies:
  - CC-3.16
  - CC-3.19
references:
  - packages/game-sdk/src/clock/room-clock.ts
  - packages/game-sdk/test/clock/room-clock.test.ts
  - apps/controller/src/runtime/link.ts
parent_task_id: CC-3
priority: low
type: feature
ordinal: 223000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A direct phone takes room time from its link pings and stops sending its 30-second clock:ping to the room, saving up to 120 requests per phone per hour (docs/architecture/realtime-link.md, Clock and latency measurement).

Type: deliverable
Branch: CC-3.23/link-clock-samples
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 While the link is direct, toHostTime uses the link offset (phone to host plus the host's room offset) and no periodic clock:ping reaches the room
- [ ] #2 On stale or relay the phone sends a relay clock sample at once and then one every 30 s
- [ ] #3 The 5 clock samples on connect still go to the room
- [ ] #4 A unit test with asymmetric fake delays keeps link-derived room time within 15 ms
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check, pnpm test, pnpm build.
<!-- SECTION:NOTES:END -->
