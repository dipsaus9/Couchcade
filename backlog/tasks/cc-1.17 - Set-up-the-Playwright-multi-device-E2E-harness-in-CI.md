---
id: CC-1.17
title: Set up the Playwright multi-device E2E harness in CI
status: To Do
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 12:27'
labels:
  - story
dependencies:
  - CC-1.6
  - CC-1.11
  - CC-1.12
references:
  - e2e/
  - playwright.config.ts
  - .github/workflows/e2e.yml
parent_task_id: CC-1
priority: high
type: chore
ordinal: 40000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Tests can drive one host and several phones against the local dev server, in CI.

Type: deliverable
Branch: CC-1.17/e2e-harness
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A fixture launches one host context and N phone contexts against the local dev server
- [ ] #2 A sensor adapter injection hook is documented for motion tests
- [ ] #3 A smoke test where the host creates a room and 2 phones join passes on Chromium and WebKit
- [ ] #4 .github/workflows/e2e.yml runs the suite on pull requests and uploads traces only on failure (7-day retention)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm e2e
<!-- SECTION:NOTES:END -->
