---
id: CC-3.8
title: Add the TV lag calibration screen on the host
status: To Do
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 12:27'
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
- [ ] #1 Players tap when a flash appears 5 times; the median display lag is stored in localStorage on the host
- [ ] #2 Games read the value through the SDK clock module; the default is 0
- [ ] #3 Calibration can be skipped
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test
<!-- SECTION:NOTES:END -->
