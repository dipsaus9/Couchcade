---
id: CC-1.5
title: Scaffold the pnpm monorepo with shared configs and all root scripts
status: To Do
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 12:27'
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
- [ ] #1 pnpm install --frozen-lockfile succeeds and pnpm check passes on the empty workspace
- [ ] #2 pnpm-workspace.yaml globs apps/*, games/*, packages/* and its catalog pins Vite 8, Vitest 4.1.x and TypeScript 6
- [ ] #3 packages/config/ provides tsconfig bases (base, vue, worker, lib) and Vite/Vitest presets
- [ ] #4 Root package.json defines every script: dev, check, test, e2e, build, deploy, check:style, check:deps, budgets, create-game, assets:recolour, trace:record (not-yet-built tools may be placeholders that exit 0)
- [ ] #5 .gitignore covers node_modules, .worktrees, .wrangler, dist and apps/server/.dev.vars
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test
<!-- SECTION:NOTES:END -->
