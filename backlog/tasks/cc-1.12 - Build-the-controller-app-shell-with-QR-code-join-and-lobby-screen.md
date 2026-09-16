---
id: CC-1.12
title: Build the controller app shell with QR/code join and lobby screen
status: To Do
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 12:27'
labels:
  - story
dependencies:
  - CC-1.8
  - CC-1.10
references:
  - apps/controller/
parent_task_id: CC-1
priority: high
type: feature
ordinal: 35000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A phone can join a room by QR code or code, enter a name and wait in the lobby.

Type: deliverable
Branch: CC-1.12/controller-app-shell
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Opening /?room=CODE pre-fills the room code
- [ ] #2 A name of 1–12 characters is required before joining
- [ ] #3 The phone joins with a player ticket and shows a lobby screen with its name, colour and shape
- [ ] #4 The layout is portrait and a screen wake lock is requested (errors ignored)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test
<!-- SECTION:NOTES:END -->
