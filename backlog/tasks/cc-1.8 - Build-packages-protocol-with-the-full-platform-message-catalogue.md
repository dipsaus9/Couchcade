---
id: CC-1.8
title: Build packages/protocol with the full platform message catalogue
status: To Do
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 12:27'
labels:
  - story
dependencies:
  - CC-1.1
  - CC-1.5
references:
  - packages/protocol/
parent_task_id: CC-1
priority: high
type: feature
ordinal: 31000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Typed, validated schemas for every platform message, so later stories never need to edit the protocol package.

Type: deliverable
Branch: CC-1.8/protocol-package
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 zod/mini schemas exist for every message in the catalogue of docs/architecture/platform.md, including presence, input, controller:state, moderation, snapshot, reconnect, player profile (Pip parts), clock ping/pong and calibration
- [ ] #2 encode() rejects any message larger than 1 KB
- [ ] #3 Each message has a valid and an invalid fixture test
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test
<!-- SECTION:NOTES:END -->
