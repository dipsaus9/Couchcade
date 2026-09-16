---
id: CC-1.2
title: 'Update README, TECH_STACK and HOUSE_STYLE with the planning decisions'
status: To Do
assignee: []
created_date: '2026-09-16 12:24'
labels:
  - story
dependencies: []
references:
  - README.md
  - docs/TECH_STACK.md
  - docs/HOUSE_STYLE.md
parent_task_id: CC-1
priority: high
type: docs
ordinal: 25000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The project docs match the decisions made during planning, so agents never build against outdated rules.

Type: deliverable
Branch: CC-1.2/record-planning-decisions
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 README testing section states the lean bar: unit tests for game and platform logic plus one bot-plays-a-match E2E per game; per-package coverage thresholds are removed
- [ ] #2 README and HOUSE_STYLE allow CC0 assets recoloured to the palettes with a credits entry, and still forbid assets, names or characters from existing games
- [ ] #3 README games table lists all 14 planned games with their inspiration and approved names
- [ ] #4 README join flow describes the QR code, the 4-letter fallback and the host passcode
- [ ] #5 README roadmap lists the epics CC-1 to CC-23 instead of the old phases
- [ ] #6 TECH_STACK lists partyserver, partysocket, nipplejs and Planck.js as chosen libraries
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: markdown links resolve (grep for broken relative links).
<!-- SECTION:NOTES:END -->
