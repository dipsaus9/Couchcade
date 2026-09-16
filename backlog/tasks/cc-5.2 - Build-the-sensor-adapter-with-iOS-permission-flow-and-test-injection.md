---
id: CC-5.2
title: Build the sensor adapter with iOS permission flow and test injection
status: To Do
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 12:28'
labels:
  - story
dependencies:
  - CC-5.1
  - CC-1.5
references:
  - packages/motion/package.json
  - packages/motion/src/sensors/
parent_task_id: CC-5
type: feature
ordinal: 72000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
One motion API for iPhone and Android that tests can replace.

Type: deliverable
Branch: CC-5.2/sensor-adapter
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 requestPermission() is only called from a user gesture and reports granted, denied or unsupported
- [ ] #2 Events pause when the page is hidden and resume when visible
- [ ] #3 The adapter can be replaced by a fake in tests
- [ ] #4 event.interval is exposed for diagnostics
- [ ] #5 package.json uses wildcard subpath exports
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test
<!-- SECTION:NOTES:END -->
