---
id: CC-5.9
title: Add the sensor trace recorder page and trace fixture format
status: To Do
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 12:28'
labels:
  - story
dependencies:
  - CC-5.2
  - CC-1.12
references:
  - apps/controller/src/dev/trace-recorder/
  - packages/motion/test/traces/
parent_task_id: CC-5
type: chore
ordinal: 79000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Real phone motion can be recorded as test fixtures.

Type: deliverable
Branch: CC-5.9/trace-recorder
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 pnpm trace:record serves a dev-only controller page that records labelled traces as JSON
- [ ] #2 The fixture format is documented in packages/motion/test/traces/README.md
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Optional owner action: record a few swings, flicks, tilts and shakes on an iPhone and an Android phone.
<!-- SECTION:NOTES:END -->
