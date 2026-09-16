---
id: CC-8.2
title: Build the party playlist engine with cumulative standings
status: To Do
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 12:28'
labels:
  - story
dependencies:
  - CC-8.1
  - CC-1.13
references:
  - packages/game-sdk/src/party/
parent_task_id: CC-8
type: feature
ordinal: 94000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Pure logic for a party night.

Type: deliverable
Branch: CC-8.2/party-playlist-engine
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Playlists pick games fitting the player count without repeats
- [ ] #2 Standings accumulate points per placement with defined tie-breaks (unit tests)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test
<!-- SECTION:NOTES:END -->
