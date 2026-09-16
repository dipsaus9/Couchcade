---
id: CC-9.2
title: Add a scheduled smoke test workflow
status: To Do
assignee: []
created_date: '2026-09-16 12:25'
updated_date: '2026-09-16 12:28'
labels:
  - story
dependencies:
  - CC-1.18
references:
  - .github/workflows/smoke.yml
parent_task_id: CC-9
type: chore
ordinal: 100000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A broken live site is noticed without anyone playing.

Type: deliverable
Branch: CC-9.2/scheduled-smoke-test
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 .github/workflows/smoke.yml runs daily and reuses tooling/smoke/
- [ ] #2 It opens a GitHub issue on failure
<!-- AC:END -->
