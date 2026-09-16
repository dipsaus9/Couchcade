---
id: CC-3.6
title: Add the real-time input batching helper
status: To Do
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 16:44'
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
- [ ] #1 The helper sends only when the value changed and never faster than the configured rate
- [ ] #2 Unit tests with fake timers prove the cap
- [ ] #3 Release/fire events are sent at once when 250 ms have passed since the last send, otherwise at the 250 ms mark (platform.md budget rule 4)
- [ ] #4 A pure aim playback helper in @couchcade/game-sdk/input replays packed aim samples on the host 250 ms behind, with a unit test
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test

Amended 2026-09-16: session-flow.md conflict 2 (platform.md spacing wins over 'flush immediately') and motion.md conflict 3 (aim playback helper for the host, needed before CC-11.4).
<!-- SECTION:NOTES:END -->
