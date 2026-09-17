---
id: CC-3.17
title: Add stream playback with prediction to @couchcade/game-sdk/input
status: To Do
assignee: []
created_date: '2026-09-17 17:50'
updated_date: '2026-09-17 17:50'
labels:
  - story
dependencies:
  - CC-3.14
  - CC-3.16
references:
  - packages/game-sdk/src/input/playback.ts
  - packages/game-sdk/src/input/aim-playback.ts
  - packages/game-sdk/src/input/index.ts
  - packages/game-sdk/test/input/playback.test.ts
parent_task_id: CC-3
priority: high
type: feature
ordinal: 216000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The TV draws any numeric stream smoothly on both paths: interpolation, brief prediction past the newest sample, catch-up without jumps and a snap to a shot's value (docs/architecture/realtime-link.md, Fallback detection and smoothing).

Type: deliverable
Branch: CC-3.17/stream-playback-prediction
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 addSample and createPlayback are exported from @couchcade/game-sdk/input and work on plain JSON tracks
- [ ] #2 Replaying a recorded aim trace through createFakeLink at 4 messages per second with 30 to 100 ms delay, 20 ms jitter and 2% loss gives p90 error under 6 world px, no overshoot beyond 4 px after the aim stops, and no stall over 150 ms while the aim moves
- [ ] #3 The same replay with direct-path settings (30 per second, delay from measured jitter) gives p90 error under 2 world px
- [ ] #4 snap moves the drawn value to a given value over 60 ms
- [ ] #5 aimAt keeps its signature and its existing tests pass
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Use the recorded aim traces in packages/motion/test/traces/ when available, else a synthetic trace.
Verify: pnpm check, pnpm test, pnpm build.
<!-- SECTION:NOTES:END -->
