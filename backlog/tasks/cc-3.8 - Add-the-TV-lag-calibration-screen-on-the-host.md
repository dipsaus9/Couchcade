---
id: CC-3.8
title: Add the TV lag calibration screen on the host
status: To Do
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 16:20'
labels:
  - story
dependencies:
  - CC-3.1
  - CC-1.14
  - CC-1.15
references:
  - apps/host/src/screens/calibration/
  - packages/game-sdk/src/clock/display-lag.ts
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
- [ ] #1 Games read the value through the SDK clock module; the default is 0
- [ ] #2 Calibration can be skipped
- [ ] #3 Players tap along to a steady flashing beat (3 practice flashes, then 5 that count); the median offset, which excludes reaction time, is stored in localStorage on the host (owner decision 2026-09-16)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test

Amended 2026-09-16: owner chose beat-tap calibration (docs/architecture/session-flow.md decision 1). Network lag is handled separately by room-clock timestamps; this measures only the TV display delay (HDMI ~20-100 ms, Chromecast ~150-300 ms).
<!-- SECTION:NOTES:END -->
