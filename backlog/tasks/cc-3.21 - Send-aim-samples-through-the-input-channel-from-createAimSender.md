---
id: CC-3.21
title: Send aim samples through the input channel from createAimSender
status: To Do
assignee: []
created_date: '2026-09-17 17:51'
updated_date: '2026-09-17 17:51'
labels:
  - story
dependencies:
  - CC-3.18
references:
  - packages/motion/src/gestures/aim.ts
  - packages/motion/test/aim/
parent_task_id: CC-3
priority: medium
type: feature
ordinal: 220000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Aim from the gyroscope and the drag pad goes out one sample at a time through input.stream with 3 decimals, so every aim game gets direct-link rates (docs/architecture/realtime-link.md, Game SDK API sketch).

Type: deliverable
Branch: CC-3.21/aim-sender-input-channel
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 createAimSender calls input.stream once per aim sample and no longer packs samples itself
- [ ] #2 Aim values are rounded to 3 decimals
- [ ] #3 A phone held still sends nothing: samples that moved less than the minimum step are skipped
- [ ] #4 The existing aim detector and drag fallback tests pass
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check, pnpm test, pnpm build.
<!-- SECTION:NOTES:END -->
