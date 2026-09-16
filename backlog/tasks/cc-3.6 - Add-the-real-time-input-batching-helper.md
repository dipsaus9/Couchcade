---
id: CC-3.6
title: Add the real-time input batching helper
status: Done
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 22:19'
labels:
  - story
dependencies:
  - CC-3.1
  - CC-1.13
references:
  - packages/game-sdk/src/input/
parent_task_id: CC-3
type: feature
ordinal: 55000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Phones send only changed input at a capped rate, protecting the request budget.

Type: deliverable
Branch: CC-3.6/input-batching-helper
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The helper sends only when the value changed and never faster than the configured rate
- [x] #2 Unit tests with fake timers prove the cap
- [x] #3 Release/fire events are sent at once when 250 ms have passed since the last send, otherwise at the 250 ms mark (platform.md budget rule 4)
- [x] #4 A pure aim playback helper in @couchcade/game-sdk/input replays packed aim samples on the host 250 ms behind, with a unit test
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. packages/game-sdk/src/input/rates.ts: PHONE_INPUT_MAX_PER_SECOND 4, PHONE_INPUT_MIN_GAP_MS 250, HOST_STATE_MAX_PER_SECOND 1.5, HOST_STATE_MIN_GAP_MS 667 (session-flow.md Rates table).
2. input/stream.ts: createInputStream(send, options) with set/fire/clear/dispose per session-flow.md rules 1-9; injected now/schedule/warn, one timer only while pending; null from send = not sent.
3. input/aim-playback.ts: pure addAimSamples(track, atMs, samples) and aimAt(track, nowMs) replaying packed [dtMs, yaw, pitch] samples 250 ms behind with interpolation (JSON-safe track for TState).
4. input/index.ts re-exports; tests in packages/game-sdk/test/input/ with vi fake timers (cap, 250 ms spacing, fire at once/at the mark, unchanged values, priority, queue limit, clear) and playback delay; a 4-sample aim input encodes under 1 KB.
5. apps/host controllerStateMinGapMs import is outside References: leave a follow-up.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test

Amended 2026-09-16: session-flow.md conflict 2 (platform.md spacing wins over 'flush immediately') and motion.md conflict 3 (aim playback helper for the host, needed before CC-11.4).

Delivered 2026-09-17: packages/game-sdk/src/input/ (rates.ts, stream.ts, aim-playback.ts). Design notes: set that returns to the last sent value also drops a pending value of that type; clear also forgets sent values so the first set after a reconnect goes out; a null from send (audience/no socket) uses no slot and is not remembered as sent. Aim playback at exactly 250 ms holds up to one sample interval (67 ms) behind, because the next sample may still be waiting for its slot; the test bounds it to that. HOST_STATE_MIN_GAP_MS (667) now lives in game-sdk/input; apps/host still has its own controllerStateMinGapMs because apps/host is outside this story's References (follow-up).

Review gate (dipsaus-ai:story-reviewer, round 1): pass. All 4 criteria met, no scope violations, no findings.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added @couchcade/game-sdk/input: the phone and host send caps (PHONE_INPUT_MAX_PER_SECOND 4, PHONE_INPUT_MIN_GAP_MS 250, HOST_STATE_MAX_PER_SECOND 1.5, HOST_STATE_MIN_GAP_MS 667); createInputStream, which wraps the controller send helper so set sends only changed values (latest per type wins), fire events queue (max 8) and go before pending sets, and every send is at least 250 ms after the last, so a release goes out at once or at the 250 ms mark; and the pure host aim playback helpers addAimSamples/aimAt, which replay packed [dtMs, yaw, pitch] samples 250 ms behind with straight-line moves. Fake-timer tests prove the 4-per-1000 ms cap, the 250 ms spacing, fire timing, priority, queue limit, clear/dispose, a 4-sample aim frame under 1 KB, and phone-to-TV aim playback 250 ms behind. Follow-up: apps/host view-sync should import HOST_STATE_MIN_GAP_MS instead of its own controllerStateMinGapMs.
<!-- SECTION:FINAL_SUMMARY:END -->
