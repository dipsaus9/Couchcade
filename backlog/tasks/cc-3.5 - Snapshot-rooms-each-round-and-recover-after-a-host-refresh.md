---
id: CC-3.5
title: Snapshot rooms each round and recover after a host refresh
status: To Do
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 12:27'
labels:
  - story
dependencies:
  - CC-3.1
  - CC-2.6
  - CC-1.15
references:
  - apps/server/src/room/room.ts
  - apps/server/src/room/snapshot.ts
  - apps/host/src/runtime/recovery.ts
  - e2e/platform/host-recovery.spec.ts
parent_task_id: CC-3
type: feature
ordinal: 54000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Refreshing the TV doesn't end the night.

Type: deliverable
Branch: CC-3.5/snapshots-and-recovery
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The host sends room:snapshot at the end of each round (one SQLite write)
- [ ] #2 A refreshed host reconnects, loads the last snapshot and resumes at the start of the next round
- [ ] #3 An E2E test reloads the host mid-game and asserts scores are kept
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test
<!-- SECTION:NOTES:END -->
