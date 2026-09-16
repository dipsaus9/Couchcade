---
id: CC-2.4
title: Validate player names with normalisation and blocklists
status: To Do
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 12:27'
labels:
  - story
dependencies:
  - CC-2.3
references:
  - packages/utils/src/names/
  - apps/server/src/security/names.ts
  - apps/server/src/api/
parent_task_id: CC-2
type: feature
ordinal: 46000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Names are safe to show on a TV at a party.

Type: deliverable
Branch: CC-2.4/player-name-rules
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Names are 1–12 characters after NFKC normalisation and match a character allowlist
- [ ] #2 Names on the NL + EN blocklist are rejected with a referee-voice message
- [ ] #3 Property tests (fast-check) cover normalisation
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test
<!-- SECTION:NOTES:END -->
