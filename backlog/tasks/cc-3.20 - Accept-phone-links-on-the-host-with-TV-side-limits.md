---
id: CC-3.20
title: Accept phone links on the host with TV-side limits
status: To Do
assignee: []
created_date: '2026-09-17 17:50'
updated_date: '2026-09-17 17:51'
labels:
  - story
dependencies:
  - CC-3.15
  - CC-3.16
  - CC-3.17
  - CC-3.18
references:
  - apps/host/src/runtime/links.ts
  - apps/host/src/runtime/link-switch.ts
  - apps/host/src/runtime/game-runner.ts
  - apps/host/src/runtime/host-runtime.ts
  - apps/host/test/runtime/links.test.ts
parent_task_id: CC-3
priority: high
type: feature
ordinal: 219000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The host answers link offers from seated players, applies link input with per-phone limits, unpacks relay samples and gives scenes each player's path and playback delay (docs/architecture/realtime-link.md, Budget and flood rules, Security and privacy).

Type: deliverable
Branch: CC-3.20/host-realtime-links
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The host answers rtc:offer only from seated players of its room with iceServers [], ignores a second offer from the same player within 5 s, and replaces that player's older link
- [ ] #2 Link frames are attributed to the link's player, and a frame that carries from, is over 1,024 bytes, is binary, is invalid JSON or fails its schema is dropped
- [ ] #3 A phone with more than 100 dropped frames in 10 s has its link closed and its offers ignored for 60 s
- [ ] #4 The host closes a player's link on player:left kicked, left or expired and on room:end, and keeps it on disconnected
- [ ] #5 Relay inputs with more reach onPlayerInput as one input per sample with its own atMs, and each event id is applied once across both paths
- [ ] #6 The host answers link:ping with link:pong carrying t1, t2 and its room clock offset, and the link code sets no host timers
- [ ] #7 HostSceneData.link returns each in-game player's path, round trip and playback delay
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check, pnpm test, pnpm build.
<!-- SECTION:NOTES:END -->
