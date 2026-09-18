---
id: CC-3.26
title: Report the phone's measured link round trip and jitter to the host
status: To Do
assignee: []
created_date: '2026-09-18 05:04'
updated_date: '2026-09-18 05:05'
labels: []
dependencies:
  - CC-3.19
  - CC-3.20
references:
  - packages/protocol/src/messages/index.ts
  - apps/controller/src/runtime/link.ts
  - apps/host/src/runtime/links.ts
  - apps/host/test/runtime/links.test.ts
  - apps/controller/test/runtime/link.test.ts
parent_task_id: CC-3
priority: medium
type: feature
ordinal: 225000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
link:ping/link:pong only ever give the host t0 (phone send), t1 and t2 (host receive/send), never t3 (the phone's own pong-receive time), so the host can never compute a true round trip the way the phone already does (apps/controller/src/runtime/link.ts's linkClockSampleOf, CC-3.19). CC-3.20 left HostSceneData.link().rttMs structurally null for every player and documented the gap (packages/protocol/src/messages/index.ts's linkPingPayloadSchema/linkPongPayloadSchema carry no field for it). Link traffic never touches Cloudflare and costs 0 requests (docs/architecture/realtime-link.md, Budget and flood rules rule 1), so the fix is free: the phone already tracks its own rttMs (a running median of its last 20 pongs) and can piggyback it on the next link:ping it sends, instead of adding a new message type. The host then has a real number for HostSceneData.link()'s rttMs and can compute the direct-path playbackDelayMs formula (clamp(1000/hz + 2*jitter, 25, 120)) from the phone's own measured jitter (p90 minus p50 of its last 20 round trips) instead of the current assumed-zero-jitter placeholder.

Type: deliverable
Branch: CC-3.26/phone-rtt-report
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 link:ping carries the phone's own last-known rttMs (a running median of its last 20 pongs, null before the first one) and its jitter (p90 minus p50 of the same window, 0 before enough samples)
- [ ] #2 The host stores the phone's reported rttMs and jitter per link and HostSceneData.link(playerId) returns that rttMs instead of null once the phone has reported one
- [ ] #3 The host's direct-path playbackDelayMs uses clamp(1000 / hz + 2 * jitter, 25, 120) with the phone's reported jitter, falling back to the existing zero-jitter default before the phone's first report
- [ ] #4 A phone that never goes direct, or whose link drops before its first pong, still reports null rttMs and 0 jitter -- HostSceneData.link() never throws and the relay path is unaffected
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Found while delivering CC-3.20 (2026-09-18): the reviewer independently verified the rttMs gap against the live protocol schemas and called leaving it null on CC-3.20 a defensible, documented gap rather than a defect, and the owner (relayed via the orchestrator) accepted that as an engineering call -- this story is the tracked fix. Collision check (bun backlog-workflow.ts collisions CC-3.26) flags an overlap with CC-3.23 (Skip periodic relay clock samples while a phone is on the direct link, To Do, not in flight) on apps/controller/src/runtime/link.ts -- both touch the phone's link:ping send path for different reasons (CC-3.23: switching toHostTime to the link offset; this story: piggybacking rttMs/jitter onto the ping payload). Not colliding right now since neither is in flight; whichever of the two is delivered second reconciles the overlap at merge time, per the usual collision-resolution rule -- no --dep edge needed between them.
<!-- SECTION:NOTES:END -->
