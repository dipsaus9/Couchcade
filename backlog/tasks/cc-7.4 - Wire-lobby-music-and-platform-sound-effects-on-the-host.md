---
id: CC-7.4
title: Wire lobby music and platform sound effects on the host
status: To Do
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 12:28'
labels:
  - story
dependencies:
  - CC-7.2
  - CC-7.3
  - CC-4.7
references:
  - apps/host/src/audio/
parent_task_id: CC-7
type: feature
ordinal: 90000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The TV sounds alive in the lobby, menu and results.

Type: deliverable
Branch: CC-7.4/host-sound-wiring
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Lobby music loops; menu and results use ui and celebrate sounds
- [ ] #2 Muting via settings silences everything
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test
<!-- SECTION:NOTES:END -->
