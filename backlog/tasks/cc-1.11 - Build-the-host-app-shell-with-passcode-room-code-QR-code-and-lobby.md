---
id: CC-1.11
title: 'Build the host app shell with passcode, room code, QR code and lobby'
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
  - apps/host/
parent_task_id: CC-1
priority: high
type: feature
ordinal: 34000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The TV can create a room, show how to join and list joined players live.

Type: deliverable
Branch: CC-1.11/host-app-shell
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The host enters the passcode and creates a room through the API
- [ ] #2 The TV shows the 4-letter code and a QR code encoding the join URL with ?room=CODE
- [ ] #3 The lobby lists joined player names live over a partysocket connection
- [ ] #4 Phaser boots at 480×270 with integer scaling
- [ ] #5 A unit test covers the join URL builder
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test
<!-- SECTION:NOTES:END -->
