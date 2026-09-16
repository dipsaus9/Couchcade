---
id: CC-7.3
title: Source and credit CC0 platform sounds and lobby music
status: To Do
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 12:28'
labels:
  - story
dependencies:
  - CC-7.1
  - CC-4.9
  - CC-1.11
references:
  - apps/host/public/audio/
  - apps/host/CREDITS.md
parent_task_id: CC-7
type: chore
ordinal: 89000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The platform has its sound effects and a lobby loop.

Type: deliverable
Branch: CC-7.3/platform-sounds
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every token has a CC0 sound in apps/host/public/audio/
- [ ] #2 apps/host/CREDITS.md lists each file with source and licence and passes the credits check
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test
<!-- SECTION:NOTES:END -->
