---
id: CC-9.2
title: Add a scheduled smoke test workflow
status: Done
assignee: []
created_date: '2026-09-16 12:25'
updated_date: '2026-09-21 03:45'
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
- [x] #1 .github/workflows/smoke.yml runs daily and reuses tooling/smoke/
- [x] #2 It opens a GitHub issue on failure
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Add .github/workflows/smoke.yml: schedule (daily 06:00 UTC, off-peak) + workflow_dispatch, following deploy.yml/ci.yml conventions (pinned-SHA actions, node-version-file, pnpm cache, concurrency block, minimal permissions). Reuses tooling/smoke/ verbatim via 'pnpm --filter @couchcade/smoke run smoke' against https://couchcade.dipsaus9.workers.dev with the same SMOKE_HOST_PASSCODE/SMOKE_TOKEN secrets deploy.yml already uses (AC1). On failure, a guarded step (permissions: issues: write) searches open issues by fixed title via gh (same gh+GITHUB_TOKEN pattern as deploy.yml's gate job) and only files a new one if none is open, so a persistently broken site doesn't spam issues daily (AC2).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Reviewer (sonnet, round 1): pass. Both ACs met — schedule (0 6 * * * + workflow_dispatch) reuses tooling/smoke/ via pnpm --filter @couchcade/smoke run smoke with deploy.yml's own SMOKE_URL/SMOKE_HOST_PASSCODE/SMOKE_TOKEN; failure step guarded with a gh issue search (is:open, title match) before gh issue create, permissions: issues: write. No scope violations, no findings.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added .github/workflows/smoke.yml: a daily-scheduled (06:00 UTC, off-peak) workflow, also triggerable via workflow_dispatch, that runs the exact same tooling/smoke/ script deploy.yml's post-deploy step runs ('pnpm --filter @couchcade/smoke run smoke' against https://couchcade.dipsaus9.workers.dev, using the existing SMOKE_HOST_PASSCODE/SMOKE_TOKEN secrets) so a broken live site is caught even on a day nobody plays. On failure it opens a GitHub issue via gh (GITHUB_TOKEN, permissions: issues: write), first searching for an already-open issue with the same fixed title so a persistently broken site doesn't get a new issue every day. Reviewed pass (sonnet, round 1), both acceptance criteria objectively met, no scope violations.
<!-- SECTION:FINAL_SUMMARY:END -->
