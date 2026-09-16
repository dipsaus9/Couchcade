---
id: CC-5.10
title: Add the motion permission step and wake lock to the controller
status: To Do
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 16:44'
labels:
  - story
dependencies:
  - CC-5.2
  - CC-1.16
  - CC-1.17
references:
  - apps/controller/src/motion/
  - e2e/platform/motion-permission.spec.ts
  - apps/host/src/motion/
parent_task_id: CC-5
type: feature
ordinal: 80000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Before a motion game, every phone enables sensors or falls back to touch.

Type: deliverable
Branch: CC-5.10/motion-permission-step
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 When the selected game has needsMotion, phones show "Tap to enable motion"
- [ ] #2 Denied or unsupported phones continue with touch fallback and the host is told
- [ ] #3 A "tap to resume" overlay appears after the page was hidden
- [ ] #4 An E2E test with the injected adapter covers granted and denied
- [ ] #5 The host shows the motion step, waits for every seated phone's motion:status or 20 seconds, and marks touch-fallback players with the touch icon
- [ ] #6 The approved motion permission screen shows the one-line Portrait Orientation Lock hint on iPhone, and Android requests fullscreen with a portrait lock during motion games
- [ ] #7 The task notes record the owner's real-iPhone check of the approved motion-denied hint (steps written for the owner); if Safari does not ask again, a one-line copy change is proposed to the owner
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test

Amended 2026-09-16 after the owner approved docs/architecture/motion.md (conflicts 2, 4 and 7; owner decision 4).
<!-- SECTION:NOTES:END -->
