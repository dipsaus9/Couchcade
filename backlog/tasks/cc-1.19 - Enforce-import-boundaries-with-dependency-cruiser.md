---
id: CC-1.19
title: Enforce import boundaries with dependency-cruiser
status: Done
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 16:05'
labels:
  - story
dependencies:
  - CC-1.5
references:
  - .dependency-cruiser.cjs
  - tooling/check-deps/
parent_task_id: CC-1
type: chore
ordinal: 42000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
CI fails when a package or game breaks the dependency direction.

Type: deliverable
Branch: CC-1.19/import-boundaries
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Rules enforce: apps → games → stage/ui/game-sdk/motion/audio/physics → theme/protocol → utils; games never import other games; nothing imports apps
- [x] #2 pnpm check:deps fails on a violating fixture and passes on the repo
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Root .dependency-cruiser.cjs holds path-pattern rules (tiers, games, apps, in-game split) from docs/architecture/platform.md. tooling/check-deps owns check:deps: a small runner (src/check-deps.ts + cli.ts) cruises whichever of apps/games/packages/tooling/e2e exist. Vitest fixture tests build throwaway monorepos in a temp dir and assert each forbidden import breaks exactly the expected rule, plus a CLI exit-code test.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check:deps

Tier split decision: AC1 lists stage/ui/game-sdk/motion/audio/physics as one middle band. The approved docs/architecture/platform.md (binding) splits it into core (game-sdk, physics, audio) and kit (stage, ui, motion; kit may import core, core may not import kit, siblings never import each other). Implemented the doc's stricter split; it satisfies AC1's intent per the approved architecture.
Also enforced from the doc's Import rules: nothing imports apps/tooling/e2e; utils imports nothing; config only from *.config.ts; server only protocol/utils; controller app no phaser/stage/physics/audio; apps reach games only via src/index.ts; game shared/ no phaser/vue/kit/host/controller/Node built-ins; host/ no vue/ui/motion/controller; controller/ no phaser/stage/audio/physics/host; index.ts static imports only shared/ + game-sdk and lazy loads only host/controller. Extra guards: every packages/* folder must be in the tier map, and unresolvable @couchcade/* imports fail.
Limits: DOM and timer globals are not imports, so check:deps can't see them (tsconfig lib and lint/check:style cover those). vue is a devDependency of check-deps so dependency-cruiser gets @vue/compiler-sfc; without it .vue files are skipped silently (a fixture test guards this).

Review gate (dipsaus-ai:story-reviewer, round 1): pass. AC1 met (core/kit split per approved platform.md, games and apps rules tested), AC2 met (check:deps passes on repo; CLI fixture test exits 1). No scope violations, no findings.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added root .dependency-cruiser.cjs with path-pattern import rules from docs/architecture/platform.md (tiers apps > games > kit > core > tier 1 > utils using the approved core/kit split, games isolated, nothing imports apps/tooling/e2e, server and controller app limits, apps reach games only via src/index.ts, in-game shared/host/controller/index rules, tier map guard, unresolvable @couchcade imports fail). tooling/check-deps runs them for pnpm check:deps over whichever workspace folders exist, and 28 Vitest fixture-repo tests prove each forbidden import fails while an architecture-compliant repo passes. check:deps passes on the current tree.
<!-- SECTION:FINAL_SUMMARY:END -->
