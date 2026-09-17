---
id: CC-3.8
title: Add the TV lag calibration screen on the host
status: In Progress
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-17 08:29'
labels:
  - story
dependencies:
  - CC-3.1
  - CC-1.14
  - CC-1.15
references:
  - apps/host/src/screens/calibration/
  - packages/game-sdk/src/clock/display-lag.ts
  - packages/game-sdk/src/clock/index.ts
  - packages/game-sdk/test/clock/display-lag.test.ts
  - apps/host/test/calibration/
  - apps/host/src/runtime/host-runtime.ts
  - apps/host/test/runtime/host-runtime.test.ts
  - apps/host/src/session/use-host-session.ts
  - apps/host/src/App.vue
  - apps/host/src/screens/lobby/LobbyScreen.vue
  - apps/controller/src/screens/calibration/
  - apps/controller/test/calibration/
  - apps/controller/src/session/state.ts
  - apps/controller/test/state.test.ts
  - apps/controller/src/App.vue
  - e2e/platform/calibration.spec.ts
parent_task_id: CC-3
type: feature
ordinal: 57000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Timing games account for HDMI or Chromecast display delay.

Type: deliverable
Branch: CC-3.8/tv-lag-calibration
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Games read the value through the SDK clock module; the default is 0
- [x] #2 Calibration can be skipped
- [x] #3 Players tap along to a steady flashing beat (3 practice flashes, then 5 that count); the median offset, which excludes reaction time, is stored in localStorage on the host (owner decision 2026-09-16)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. packages/game-sdk/src/clock/display-lag.ts: storage key couchcade:display-lag, {ms, measuredAt}; readDisplayLag/getDisplayLagMs(storage?) default 0 on missing/broken/blocked storage; saveDisplayLag clamps 0-400; re-export from clock/index.ts; unit tests.
2. apps/host/src/screens/calibration/calibration.ts: pure maths (flashAt frame recording, nearest-flash matching within half a beat, one tap per flash per player, per-player median of >=3 matched taps, room median of medians clamped 0-400) + createCalibration state (lead-in, 3 practice + 5 counting flashes on a 750 ms beat, 150 ms flash, end timer, retry, views). Unit tests incl. reaction-time independence with synthetic taps.
3. CalibrationScreen.vue on the TV: rAF loop maps frame timestamp to room time and records flashAt; flash panel, dots, last tap chips, lag so far, Skip, retry state.
4. Host runtime: calibration phase, checkTvLag/skip/retry, calibration:tap routing, VIP skip-calibration, displayLagMs from getDisplayLagMs into InputContext and scene data. Lobby 'Check TV lag' button with the current value.
5. Phone: calibration view parser, tap sender (room time from event.timeStamp, max 4/s), CalibrationScreen with CcBigAction and VIP Skip; state.ts screen routing.
6. E2E: calibration spec (phones get the tap target, VIP skip, no-taps retry then TV skip). Existing specs untouched: calibration is on demand from the lobby, never forced (session-flow.md).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test

Amended 2026-09-16: owner chose beat-tap calibration (docs/architecture/session-flow.md decision 1). Network lag is handled separately by room-clock timestamps; this measures only the TV display delay (HDMI ~20-100 ms, Chromecast ~150-300 ms).

Delivery notes (CC-3.8):
- Method per session-flow.md: 3 practice + 5 counting flashes, 150 ms lit on a 750 ms beat after a 1 s lead-in; flashAt = room time of the requestAnimationFrame that first draws a flash (Vue patches the DOM in a microtask before that frame paints). Taps carry at from event.timeStamp in room time.
- Outliers: a tap is matched to the nearest drawn flash; more than half a beat (375 ms) away, or nearest a practice flash, it is dropped. One offset per player per flash (closest tap). Per-player median needs 3 matched taps; room value = median of player medians, clamped 0-400 ms. Nobody at 3 taps -> 'Let's try that again' with Try again / Skip, old value kept.
- Stored as {ms, measuredAt} under couchcade:display-lag in host localStorage; getDisplayLagMs(storage?) returns 0 when missing/broken/blocked. Host runtime reads it once per game into InputContext.displayLagMs and HostSceneData.displayLagMs.
- Night flow: on demand from the TV lobby ('Check TV lag', shows 'TV lag N ms' once stored), never forced, so Quick Draw and rejoin E2E specs are unchanged. Skip from the TV or the VIP's skip-calibration returns to the lobby.
- Phones: calibration view {vip, active}; CcBigAction 'Tap with the flash', VIP also gets Skip; taps closer than 250 ms are dropped (4/s budget).
- References amended to the glue files (host runtime/session/App/lobby, controller App/state, tests, new e2e spec).
- Reduced motion: the flash stays (it is the measurement, a colour change at 1.3 Hz, under the 3 flashes/s limit).
- Scratch check: a local Playwright run tapping on a timer stored 'TV lag 20 ms' (localhost tap latency), chromium e2e 5/5 and calibration spec on webkit pass.
<!-- SECTION:NOTES:END -->
