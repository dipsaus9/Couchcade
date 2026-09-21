---
id: CC-3.23
title: Skip periodic relay clock samples while a phone is on the direct link
status: Done
assignee: []
created_date: '2026-09-17 17:51'
updated_date: '2026-09-21 03:23'
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
- [x] #1 While the link is direct, toHostTime uses the link offset (phone to host plus the host's room offset) and no periodic clock:ping reaches the room
- [x] #2 On stale or relay the phone sends a relay clock sample at once and then one every 30 s
- [x] #3 The 5 clock samples on connect still go to the room
- [x] #4 A unit test with asymmetric fake delays keeps link-derived room time within 15 ms
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. packages/game-sdk/src/clock/room-clock.ts: add setLinkOffset(offsetMs: number | null) to
   RoomClock. toHostTime prefers the link offset over the relay-derived offsetMs while it is set.
   The periodic 30s resync clock:ping is skipped at each tick while a link offset is set (burst
   of 5 on connect is untouched). Leaving direct (setLinkOffset(null) after being non-null) fires
   one relay sample immediately and restarts the 30s cadence from that moment. disconnect/connect
   reset the link offset to null so a reconnect always starts back on the relay path. Export a
   free `setLinkOffset` next to the existing `toHostTime` free function, bound to the shared
   `roomClock` singleton.
2. apps/controller/src/runtime/link.ts: import linkOffsetToRoom alongside the existing
   linkClockSampleOf import from @couchcade/game-sdk/link. Add an injectable
   ControllerLinkOptions.setLinkOffset (default the new room-clock export), mirroring the
   existing toHostTime option. In handleStreamMessage, read `r` off the link:pong payload; after
   machine.pong(), if machine.state === "direct", call setLinkOffset(linkOffsetToRoom(sample.offsetPHMs, r)).
   In the existing machine.onChange callback, call setLinkOffset(null) whenever the next state
   isn't "direct" (covers stale, relay, connecting, off - idempotent/no-op when already null).
3. packages/game-sdk/test/clock/room-clock.test.ts: unit tests for the new scheduling (resync
   pauses while a link offset is set, fires at once + resumes the 30s cadence on clearing it,
   burst of 5 unaffected) and for toHostTime preferring the link offset. AC4: a new asymmetric
   fake-delay test, built the same way as the existing "asymmetric latency" network rig but for
   the link path (using linkClockSampleOf/linkOffsetToRoom from @couchcade/game-sdk/link with
   deliberately asymmetric, not symmetric, one-way delays), asserting the setLinkOffset-derived
   toHostTime stays within 15 ms of true room time - this is the test that would catch a naive
   halved-RTT implementation.
Verify: pnpm check, pnpm test, pnpm build (worker-brief override; story notes ask the same).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check, pnpm test, pnpm build.

Implemented:
- packages/game-sdk/src/clock/room-clock.ts: added RoomClock.setLinkOffset(offsetMs | null) and a
  matching free `setLinkOffset` export (mirrors `toHostTime`). toHostTime now prefers the link
  offset over the relay-derived offsetMs while it is set. The periodic 30s resync clock:ping is
  skipped at each tick while a link offset is set (burst of 5 on connect untouched). Leaving direct
  (setLinkOffset(null) after non-null) sends a relay sample at once and restarts the 30s cadence
  from that moment. connect()/disconnect() reset the link offset so every reconnect starts back on
  the relay path.
- apps/controller/src/runtime/link.ts: handleStreamMessage now reads `r` off link:pong and, once
  machine.state is "direct" after machine.pong(), calls setLinkOffset(linkOffsetToRoom(sample.offsetPHMs, r)).
  The existing machine.onChange callback calls setLinkOffset(null) whenever the next state isn't
  "direct" (idempotent no-op otherwise), covering stale/relay/connecting/off.
- packages/game-sdk/test/clock/room-clock.test.ts: new "link offset (CC-3.23)" describe covering
  AC1-3 (link offset preferred by toHostTime, resync paused while direct, resumed at once + 30s
  rhythm on leaving direct, 5-sample burst unaffected). New "link offset accuracy (CC-3.23, AC4)"
  describe: an asymmetric fake-delay link rig (30-34ms forward, 10-14ms return -- never symmetric)
  feeding linkClockSampleOf/linkOffsetToRoom into setLinkOffset, asserting toHostTime stays within
  15ms of true room time across 5 seeded runs of 50s each.

Verify: pnpm check, pnpm test, pnpm build all green in the worktree (apps/controller,
packages/game-sdk, and the full repo).

Scope: stayed entirely within the three declared References; no other files needed changes
(existing apps/controller/test/runtime/link.test.ts passed unmodified).

Review gate (dipsaus-ai:story-reviewer, model sonnet, round 1): verdict pass. All 4 acceptance
criteria met (link offset feeds toHostTime while direct with no periodic clock:ping reaching the
room; setLinkOffset(null) on leaving direct fires a relay sample at once then resumes 30s cadence;
5-sample burst on connect unaffected; AC4 asymmetric-delay test keeps error under 15ms across 5
seeds x 200 samples). No scope violations, no blocking or advisory findings. Changed paths exactly
match the three declared References.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A direct phone's toHostTime now prefers the link-derived room offset (phone-to-host offset from link:ping/link:pong plus the host's reported room offset r) over the relay-derived offset, computed in apps/controller/src/runtime/link.ts and fed into packages/game-sdk/src/clock/room-clock.ts via a new RoomClock.setLinkOffset method. While a link offset is set, the room clock's periodic 30s resync clock:ping is skipped (the 5-sample burst on connect is unaffected); leaving direct sends a relay sample at once and resumes the 30s rhythm. Verified with new unit tests in packages/game-sdk/test/clock/room-clock.test.ts, including an asymmetric fake-delay link rig (AC4) that keeps link-derived room time within 15ms across 5 seeded runs. Reviewed by dipsaus-ai:story-reviewer (sonnet): pass, round 1, no findings. pnpm check/test/build all green.
<!-- SECTION:FINAL_SUMMARY:END -->
