---
id: CC-2.9
title: Keep rude words out of room codes
status: To Do
assignee: []
created_date: '2026-09-17 09:02'
updated_date: '2026-09-17 09:02'
labels:
  - story
dependencies:
  - CC-1.7
references:
  - packages/utils/src/room-code/
  - packages/utils/test/
parent_task_id: CC-2
type: feature
ordinal: 208000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A room code shown big on the TV never spells a rude word in Dutch or English.

Type: deliverable
Branch: CC-2.9/room-code-blocklist
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 roomCode() in packages/utils/src/room-code/ redraws when the 4-letter code is on a small NL + EN blocklist, for both the crypto and the seeded RNG paths
- [ ] #2 The blocklist lives next to roomCode(), only contains words that can be built from the room-code alphabet (A-Z without I and O), and is covered by a test
- [ ] #3 A fast-check property shows roomCode() never returns a blocked code and still only returns valid codes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Owner decision 2026-09-17 (security.md decision 20).
<!-- SECTION:NOTES:END -->
