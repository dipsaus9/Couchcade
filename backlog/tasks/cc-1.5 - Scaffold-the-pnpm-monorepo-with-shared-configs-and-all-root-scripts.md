---
id: CC-1.5
title: Scaffold the pnpm monorepo with shared configs and all root scripts
status: Done
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 15:44'
labels:
  - story
dependencies:
  - CC-1.1
references:
  - package.json
  - pnpm-workspace.yaml
  - packages/config/
  - .oxlintrc.json
  - .oxfmtrc.json
  - .gitignore
  - .node-version
  - .npmrc
parent_task_id: CC-1
priority: high
type: chore
ordinal: 28000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
An empty but working monorepo that every package and game plugs into without touching root files again.

Type: deliverable
Branch: CC-1.5/monorepo-scaffold
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 pnpm install --frozen-lockfile succeeds and pnpm check passes on the empty workspace
- [x] #2 pnpm-workspace.yaml globs apps/*, games/*, packages/* and its catalog pins Vite 8, Vitest 4.1.x and TypeScript 6
- [x] #3 packages/config/ provides tsconfig bases (base, vue, worker, lib) and Vite/Vitest presets
- [x] #4 Root package.json defines every script: dev, check, test, e2e, build, deploy, check:style, check:deps, budgets, create-game, assets:recolour, trace:record (not-yet-built tools may be placeholders that exit 0)
- [x] #5 .gitignore covers node_modules, .worktrees, .wrangler, dist and apps/server/.dev.vars
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Root package.json (pnpm@11.27.0, Node 24) with all 12 root scripts: dev/check/test/build fan out with pnpm -r --if-present; e2e, check:style, check:deps, budgets, create-game, assets:recolour and trace:record delegate with pnpm --filter to the package that later owns the tool (e2e/, tooling/<tool>/, @couchcade/controller), so they exit 0 until it exists and later stories never edit root scripts.
2. pnpm-workspace.yaml: apps/*, games/*, packages/*, plus tooling/* and e2e (so tools can own deps); spikes/ excluded; minimumReleaseAge, allowBuilds esbuild+workerd; catalog for the whole stack (Vite ^8.3, Vitest ~4.1.11, TypeScript ^6.0.3, wrangler ~4.131.2, workers-types v5, ...).
3. packages/config: tsconfig bases base/lib/vue/worker and vite presets defineAppConfig/defineLibConfig/defineWorkerConfig/defineTestConfig with a unit test.
4. .oxlintrc.json (Math.random/Date.now ban in games/*/src/shared), .oxfmtrc.json; both ignore spikes/ and backlog/.
5. .gitignore, .node-version. .npmrc skipped: pnpm 11 reads only auth/registry settings from it.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test

Review gate (story-reviewer, round 1): pass. All 5 ACs met, no scope violations. Advisory: delegated root scripts (e2e, check:style, check:deps, budgets, create-game, assets:recolour, trace:record, deploy) print 'No projects matched' and exit 0 while their target package is missing, so a misnamed tool package would pass silently; once targets exist consider --fail-if-no-match.
Conventions for later stories: each tool is a workspace package at the delegated path (tooling/check-style, tooling/check-deps, tooling/budgets, tooling/create-game, tooling/assets, e2e) or @couchcade/controller (trace:record), with a package script of the same name as the root script. Packages expose typecheck/test/build/dev scripts for the pnpm -r fan-out. Markdown is excluded from oxfmt so docs are not reflowed. .npmrc not created: pnpm 11 only reads auth/registry settings from it; settings live in pnpm-workspace.yaml.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Scaffolded the pnpm 11 monorepo: root package.json (pnpm@11.27.0, Node 24) defines all 12 root scripts once; dev/check/test/build fan out with pnpm -r, and not-yet-built tools delegate via pnpm --filter to the package that will own them (tooling/<tool>, e2e, @couchcade/controller), exiting 0 until it exists. pnpm-workspace.yaml globs apps/*, games/*, packages/* (+ tooling/*, e2e; spikes/ excluded), sets minimumReleaseAge and allowBuilds for esbuild/workerd, and catalogs the whole stack (Vite ^8.3.0, Vitest ~4.1.11, TypeScript ^6.0.3, wrangler ~4.131.2, workers-types v5, ...). packages/config ships tsconfig bases base/lib/vue/worker and Vite/Vitest presets (defineAppConfig, defineLibConfig, defineWorkerConfig, defineTestConfig) with unit tests; bases were proven by throwaway consumer packages (types resolve, lib/worker reject DOM, app preset builds with base /host/). Root .oxlintrc.json bans Math.random/Date.now/performance.now in games/*/src/shared; .oxfmtrc.json and oxlint ignore spikes/ and backlog/ (and oxfmt skips Markdown). .gitignore covers node_modules, .worktrees, .wrangler, dist, .dev.vars. pnpm install --frozen-lockfile, pnpm check and pnpm test pass.
<!-- SECTION:FINAL_SUMMARY:END -->
