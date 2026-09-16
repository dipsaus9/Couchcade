---
id: CC-1.6
title: 'Add the CI workflow for check, style, deps, test and build'
status: To Do
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 12:27'
labels:
  - story
dependencies:
  - CC-1.5
references:
  - .github/workflows/ci.yml
  - renovate.json
parent_task_id: CC-1
priority: high
type: chore
ordinal: 29000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Every pull request and push to main runs the root scripts in GitHub Actions.

Type: deliverable
Branch: CC-1.6/ci-workflow
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 .github/workflows/ci.yml runs on pull_request and push to main and calls pnpm check, check:style, check:deps, test and build
- [ ] #2 All actions are pinned to full commit SHAs and pnpm store caching is enabled
- [ ] #3 renovate.json groups dev dependencies weekly and holds Vitest below 5
- [ ] #4 The CI run on this story's PR is green
<!-- AC:END -->
