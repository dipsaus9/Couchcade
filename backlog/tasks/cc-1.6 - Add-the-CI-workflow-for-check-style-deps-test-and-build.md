---
id: CC-1.6
title: 'Add the CI workflow for check, style, deps, test and build'
status: Done
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 15:50'
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
- [x] #1 .github/workflows/ci.yml runs on pull_request and push to main and calls pnpm check, check:style, check:deps, test and build
- [x] #2 All actions are pinned to full commit SHAs and pnpm store caching is enabled
- [x] #3 renovate.json groups dev dependencies weekly and holds Vitest below 5
- [x] #4 The CI run on this story's PR is green
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Single ci.yml with a matrix job per root script (check, check:style, check:deps, test, build) so each is a separate status check; actions pinned to commit SHAs with version comments; pnpm/action-setup reads packageManager, setup-node uses .node-version with cache: pnpm; concurrency cancels superseded PR runs. renovate.json: config:recommended + pinGitHubActionDigests, weekly schedule, minimumReleaseAge 1 day, one non-major group, Vitest allowedVersions <4.2.0. Validate with renovate-config-validator --strict, then confirm CI green on the PR.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review gate (story-reviewer, round 1): pass. All 4 criteria met, no scope violations, no findings. CI evidence: PR #32 run 35117802707 green (check, check:style, check:deps, test, build). renovate-config-validator --strict: valid. First PR run: parallel jobs race to reserve the pnpm cache key, one saves and the rest log 'Unable to reserve cache' (expected, harmless).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added .github/workflows/ci.yml: on pull_request and push to main, a fail-fast-off matrix runs one job per root script (check, check:style, check:deps, test, build) so each is its own status check. Actions are pinned to commit SHAs (checkout v7.0.1, pnpm/action-setup v6.1.0, setup-node v7.0.0) with version comments, pnpm comes from packageManager, Node from .node-version, setup-node caches the pnpm store, permissions are contents: read, and concurrency cancels superseded PR runs while main runs finish. Added renovate.json: config:recommended plus pinGitHubActionDigests, weekly Monday-morning schedule, minimumReleaseAge 1 day (matching pnpm), one grouped non-major PR updating the pnpm catalog, and Vitest held below 4.2. CI on PR #32 is green.
<!-- SECTION:FINAL_SUMMARY:END -->
