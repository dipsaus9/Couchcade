---
id: CC-4.10
title: 'Implement check:style for colours, fonts, v-html and new Date in shared'
status: Done
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 22:17'
labels:
  - story
dependencies:
  - CC-4.2
  - CC-1.5
references:
  - tooling/check-style/
  - tooling/assets/src/check-cli.ts
parent_task_id: CC-4
type: chore
ordinal: 70000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
CI catches house style and determinism violations.

Type: deliverable
Branch: CC-4.10/style-checks
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 pnpm check:style fails on raw hex/rgb/hsl or font-family outside packages/theme
- [x] #2 It fails on v-html in any .vue file
- [x] #3 It fails on new Date( inside games/*/src/shared/
- [x] #4 Each rule has a failing fixture test
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
New tooling/check-style package (@couchcade/check-style), mirroring tooling/check-deps' shape:
- src/rules/colors-and-fonts.ts: scans .vue/.css (+fontFamily literal in .ts/.tsx) under apps,
  games, packages, tooling, e2e for raw hex/rgb()/hsl() and hardcoded font-family, excluding
  packages/theme (source of truth), tooling/assets (CC0 palette pipeline works with hex as data),
  and test files (documented allowlist in src/allowlist.ts).
- src/rules/v-html.ts: bans v-html in any .vue file.
- src/rules/new-date.ts: bans `new Date(` in games/*/src/shared/**.
- src/rules/shared-globals.ts (orchestrator-requested, docs/HOUSE_STYLE.md enforcement list +
  platform.md "no phaser, vue, DOM or timers" in shared/): bans window, document, setTimeout,
  setInterval, requestAnimationFrame in games/*/src/shared/**. Skips Math.random/Date.now/
  performance.now - already banned by Oxlint's no-restricted-properties override for that path
  (.oxlintrc.json), to avoid double-reporting.
- src/sprite-check.ts (orchestrator-requested wiring of CC-4.9's checkAllGameAssets): spawns
  tooling/assets/src/check-cli.ts as a child process rather than importing it, because
  dependency-cruiser's no-tool-imports-another-tool rule forbids one tool statically importing
  another - spawning its CLI reuses the real implementation without crossing that boundary.
- src/check-style.ts aggregates all rule violations + the sprite check into one report/exit code.
- Repo scan confirmed the current tree is clean for every rule (no fix-up needed before landing).
- Each rule gets its own failing-fixture unit test (AC4) against temp fixture roots, plus a real
  end-to-end CLI test against the actual repo tree.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check:style

References amended: added tooling/assets/src/check-cli.ts. Its check-sprites CLI hardcoded repoRoot with no way to point it at a fixture; added an optional rootDir CLI arg (process.argv[2] ?? repoRoot), mirroring tooling/check-deps/src/cli.ts exactly. Default behaviour (no arg) is unchanged. This is the one-line fix needed to test check:style's sprite-check wiring (src/sprite-check.ts) against a fixture instead of the real repo. Told the reviewer.

Orchestrator-requested scope added on top of AC1-4 (docs/HOUSE_STYLE.md enforcement list ~lines 480-490, and docs/architecture/platform.md 'src/shared/ ... No phaser, vue, DOM or timers'): banned window, document, setTimeout, setInterval, requestAnimationFrame in games/*/src/shared/** (src/rules/shared-globals.ts). Math.random/Date.now/performance.now deliberately excluded - already banned there by Oxlint's no-restricted-properties override (.oxlintrc.json), to avoid double-reporting. Also wired CC-4.9's checkAllGameAssets sprite/grid check into check:style (src/sprite-check.ts), spawned as a child process (not imported) to respect check:deps' no-tool-imports-another-tool rule. Told the reviewer.

Independent review (dipsaus-ai:story-reviewer): verdict pass, round 1. All 4 acceptance criteria met, no scope violations, no findings. Reviewer independently verified: pnpm --filter ./tooling/check-style run test (7 files, 37 tests, all green), pnpm check:style exits 0 on the real repo tree (both the rule checks and the CC-4.9 sprite-check wiring), pnpm check:deps clean (confirms the subprocess-spawn approach doesn't trip no-tool-imports-another-tool), pnpm --filter ./tooling/check-style run typecheck clean, and confirmed the diff touches only the declared References.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added tooling/check-style (@couchcade/check-style), wired to the existing root pnpm check:style script. It fails on: raw hex/rgb()/hsl() colours and hardcoded font-family outside @couchcade/theme (in .vue <style> blocks, .css files, and literal Phaser fontFamily strings in .ts/.tsx); v-html in any .vue file; and new Date()/window/document/setTimeout/setInterval/requestAnimationFrame in games/*/src/shared/** (Math.random/Date.now/performance.now are left to Oxlint's existing rule for that path to avoid double-reporting). It also wires CC-4.9's checkAllGameAssets sprite palette/grid check into check:style, spawned as a child process to respect check:deps' no-tool-imports-another-tool rule. Each rule has its own failing-fixture unit test (37 tests total). tooling/assets/src/check-cli.ts gained an optional rootDir argument (References amended) to make the sprite-check wiring testable; default behaviour is unchanged. Verified: pnpm check:style, check, test, build and check:deps all pass green on the current tree. Independent review: pass, round 1, no findings.
<!-- SECTION:FINAL_SUMMARY:END -->
