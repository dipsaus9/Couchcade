---
id: CC-1.14
title: Add NTP-style clock sync between phones and host
status: To Do
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 12:27'
labels:
  - story
dependencies:
  - CC-1.13
references:
  - packages/game-sdk/src/clock/
parent_task_id: CC-1
priority: high
type: feature
ordinal: 37000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Every phone can convert its own timestamps to host time, so timing games are fair despite relay lag.

Type: deliverable
Branch: CC-1.14/clock-sync
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The offset is estimated from at least 5 ping/pong samples, discarding round trips above median + 1 standard deviation
- [ ] #2 Clocks resync every 30 seconds and after a reconnect
- [ ] #3 toHostTime(phoneTimestamp) is exported
- [ ] #4 A unit test with simulated asymmetric latency keeps the error under 15 ms
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test
<!-- SECTION:NOTES:END -->
