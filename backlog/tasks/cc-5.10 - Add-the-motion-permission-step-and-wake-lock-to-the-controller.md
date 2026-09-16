---
id: CC-5.10
title: Add the motion permission step and wake lock to the controller
status: To Do
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 12:28'
labels:
  - story
dependencies:
  - CC-5.2
  - CC-1.16
  - CC-1.17
references:
  - apps/controller/src/motion/
  - e2e/platform/motion-permission.spec.ts
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
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test
<!-- SECTION:NOTES:END -->
