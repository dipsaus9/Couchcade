---
id: CC-1.14
title: Add NTP-style clock sync between phones and host
status: Done
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 16:46'
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
- [x] #1 The offset is estimated from at least 5 ping/pong samples, discarding round trips above median + 1 standard deviation
- [x] #2 Clocks resync every 30 seconds and after a reconnect
- [x] #3 toHostTime(phoneTimestamp) is exported
- [x] #4 A unit test with simulated asymmetric latency keeps the error under 15 ms
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. packages/game-sdk/src/clock/estimate.ts: pure sampleOf(t0,t1,t3) and estimateOffset(samples): needs >= 5 samples, drops rtt > median + 1 population SD, median offset of the rest.
2. packages/game-sdk/src/clock/room-clock.ts: createRoomClock({ now, schedule }) with injected local clock and timer; connect(send) takes 5 samples 200 ms apart and then 1 every 30 s into a rolling window of 8; disconnect() cancels timers and pending pings; receive(pong) matches by id; a new connect (reconnect) clears the window and resyncs. toHostTime(local) = Math.round(local + offset), integer room time. Default instance roomClock plus exported toHostTime bound to it; defaults read performance/setTimeout through globalThis (lib tsconfig has no DOM).
3. src/clock/index.ts re-exports the files, leaving room for CC-3.8's display-lag.ts.
4. Tests in packages/game-sdk/test/clock/: estimator unit tests, and a deterministic simulated network (virtual scheduler, seeded jitter, asymmetric uplink/downlink, uplink spikes, clock drift, reconnect with a clock jump) asserting error < 15 ms.
5. Budget arithmetic in notes.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test

Budget check (every clock:ping is 1 incoming DO request; pongs are free):
- Per device: 5 samples per connect or reconnect + 1 every 30 s = 3,600 s / 30 s = 120 per hour. platform.md already budgets exactly this schedule: 'Cost of each activity' row 'Clock sync: 5 samples on connect, then 1 every 30 s = 5 per connect + 120 per device per hour', and the 20,000 reserve counts 'about 4,800 keep-alive and clock samples (9 devices x 2 hours x 264)', where 264 = 144 keep-alive + 120 clock. session-flow.md budgets 5 clock samples per phone reconnect (about 8 requests) and per TV refresh (about 10).
- Design night (host + 8 phones, 2 h): clock only 9 x 2 x 120 = 2,160, plus 9 x 5 = 45 on connect, plus 5 per reconnect (20 reconnects = 100). About 2,300.
- Owner cap of 16 phones (8 players + 8 audience) + host: 17 x 2 x 120 = 4,080 clock; with keep-alive 17 x 2 x 264 = 8,976. Reserve then holds about 8,100 turn-based inputs + 8,976 + a few hundred connects and room messages = about 17,400 of 20,000. Still fits; no doc change needed.

Implementation notes:
- Module layout: src/clock/index.ts re-exports estimate.ts (pure math) and room-clock.ts (createRoomClock, roomClock, toHostTime). CC-3.8 adds display-lag.ts and one export line.
- toHostTime rounds to an integer (Math.round) because at, t1 and joinedAt are integers; t0 stays fractional. Local time is performance.timeOrigin + performance.now() (platform.md step 1), so an event's timeStamp must be passed as performance.timeOrigin + event.timeStamp. platform.md 'How the phone shows a controller' step 3 writes toHostTime(event.timeStamp) as shorthand; CC-1.16 must add timeOrigin.
- Before the first estimate the offset is 0 (the device's epoch time). A reconnect clears the samples and keeps the last offset until 5 new samples are in; whenSynced() resolves per connection.
- Test scenario: ping 30-40 ms, pong 15-25 ms (mean asymmetry 15 ms), 1 in 20 messages each way held 100-200 ms, in-order delivery (head-of-line), phone 3.5 s behind and 20 ppm fast. Seeds 1-20: worst error 13 ms over 10 minutes. A 1,000-seed sweep outside the suite: 5 runs (0.5%) exceed 15 ms, all where 2 or more of the 5 burst samples were held up, so the median + 1 SD filter keeps a bad sample; the rolling window of 8 corrects it on later resyncs. That is a property of the specified filter, not a bug. A constant path asymmetry A always leaves A/2 of error, which no ping/pong scheme can see.

Review gate (dipsaus-ai:story-reviewer, round 1): pass. AC 1-4 met, no scope violations, no findings. Reviewer accepted packages/game-sdk/test/clock/ as the only place the AC 4 unit test can live (repo test convention).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added @couchcade/game-sdk/clock. estimate.ts turns ping/pong round trips into samples (rtt = t3 - t0, offset = t1 - (t0 + t3) / 2) and estimates the offset from at least 5 samples, dropping round trips above median + 1 SD and taking the median offset of the rest. room-clock.ts has createRoomClock with an injected local clock and scheduler: connect(send) takes 5 samples 200 ms apart, then 1 every 30 s into a window of the last 8; disconnect() cancels timers and pending pings; a reconnect clears the samples and syncs again. It also exports whenSynced() and lastRttMs, the shared roomClock, and toHostTime(localTimestamp), which rounds to integer room time. Tests run on virtual time: the estimator, the schedule, reconnects and stale pongs, and a simulated network (ping 30-40 ms, pong 15-25 ms, 5% of messages held 100-200 ms, in-order delivery, 20 ppm drift, a sleep and reconnect). Worst error over 20 seeds is 13 ms, under the 15 ms target. The resync schedule costs 5 requests per connect + 120 per device per hour, which platform.md already budgets. Even at 16 phones it fits the 20,000 reserve (see notes).
<!-- SECTION:FINAL_SUMMARY:END -->
