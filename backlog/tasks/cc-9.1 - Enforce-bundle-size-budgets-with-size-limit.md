---
id: CC-9.1
title: Enforce bundle size budgets with size-limit
status: Done
assignee: []
created_date: '2026-09-16 12:25'
updated_date: '2026-09-17 08:52'
labels:
  - story
dependencies:
  - CC-1.5
  - CC-1.11
  - CC-1.12
references:
  - .size-limit.json
  - tooling/budgets/
  - .github/workflows/ci.yml
parent_task_id: CC-9
type: chore
ordinal: 99000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
CI fails when the phone or TV bundle grows past the README budgets.

Type: deliverable
Branch: CC-9.1/bundle-budgets
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 pnpm budgets checks controller initial JS ≤ 80 KB gzip, per-game controller chunk ≤ 25 KB, host platform JS ≤ 450 KB
- [x] #2 The check runs in CI through the existing root script
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
tooling/budgets builds apps/controller and apps/host in-memory via the Vite JS API (write: false,
no dependency on a prior pnpm build) and classifies Rolldown's output chunks/assets by
facadeModuleId: anything under games/<id>/ is that game's own code, everything else is platform
code. This sidesteps the hashed/generic chunk-name problem (multiple games would all produce
"Controller-<hash>.js" chunks, indistinguishable by filename glob alone) without touching
apps/controller or apps/host's committed vite.config.ts. Budgets live in .size-limit.json at the
repo root (one entry per check: app, kind, gzip/raw, limit, doc pointer); tooling/budgets/src/cli.ts
reads it, runs the checks and prints a pass/fail report. Root `budgets` script already delegates to
tooling/budgets (package.json, pre-existing). CI: added `budgets` to the ci.yml script matrix
(References amended to include .github/workflows/ci.yml) so it runs as its own required-adjacent
job; did not touch branch protection / required status checks, per the brief.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm budgets

Deviated from TECH_STACK.md's size-limit/Lighthouse CI choice for the size measurement itself:
size-limit's @size-limit/file plugin only globs already-built file names, which cannot
disambiguate per-game chunks once two games both produce a generically-named
"Controller-<hash>.js" chunk (Rollup names chunks from the source file basename, and every game's
controller UI component is plausibly named similarly). Implemented a small custom tool instead
that classifies Rollup/Rolldown's own output metadata (facadeModuleId) by game folder, which is
exact regardless of hashing or naming collisions and needs no maintained per-game list. The
`.size-limit.json` filename/shape convention is kept as the single source of budget numbers.
Left TECH_STACK.md's "Budgets: size-limit, Lighthouse CI" line as-is per the brief (Lighthouse CI
is a documented README follow-up, out of scope for this story).

Phaser chunk budget (400 KB gzip) is not a documented number in docs/architecture/platform.md --
Phaser is folded into the single 450 KB "host platform JS" budget there. Added it as a
supplementary early-warning check with headroom over the measured ~357.5 KB (currently ~345.5 KB
at this tool's gzip level 9), recorded in .size-limit.json's "note" field on that entry, so a
Phaser version bump surfaces on its own instead of only tripping the combined 450 KB total.

Measured with pnpm build on this branch (Node 24, Vite 8/Rolldown): controller initial JS
index-*.js ~49.2 KB gzip (Vite's own reporter) / ~47.5 KB gzip (this tool, gzip level 9); Quick
Draw controller chunk (defineController wrapper + Controller.vue) ~2.0 KB gzip; controller fonts
(fredoka.woff2 + pixelify-sans.woff2) ~20.1 KB raw; host platform JS (index + boot + Phaser,
excluding the game's own scene chunk) ~400.8 KB gzip; Phaser chunk alone ~345.5 KB gzip. All well
inside budget. `pnpm budgets` fails with a non-zero exit and names the offending check(s) when a
budget is broken (spot-checked by temporarily lowering a limit).

Correction (story-reviewer round 1, advisory): the earlier notes and .size-limit.json's "note"
fields wrongly attributed the enforced numbers to docs/architecture/platform.md. The actual
source is README.md's "Performance budgets" section (docs/architecture/platform.md has budget
RULES for the Durable Object free tier, not these bundle-size numbers). Fixed the citations in
.size-limit.json, tooling/budgets/package.json and tooling/budgets/src/report.ts to say README.md.

Reviewer (dipsaus-ai:story-reviewer), round 1: verdict PASS. AC #1 and AC #2 both met=true,
no scope violations. Two advisory findings (non-blocking): (1) budget doc citations pointed at
docs/architecture/platform.md instead of README.md -- fixed in a follow-up commit, see the
correction note above; (2) the per-game check's zero-games fallback path is untested -- left as
a known, low-risk gap (a regression there would very likely also inflate the "Controller initial
JS" platform total and get caught anyway).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added tooling/budgets, a self-contained CLI (pnpm budgets) that builds apps/controller and
apps/host via the Vite API and enforces bundle size budgets from README.md's Performance
budgets section: controller initial JS <=80 KB gzip, per-game controller chunk <=25 KB gzip
(discovered per games/*/src/controller entry directly from the build output's facadeModuleId,
no maintained game list), controller fonts <=40 KB raw, and host platform JS (incl. Phaser,
excl. each game's own scene chunk) <=450 KB gzip. Also added an undocumented-but-recorded
Phaser-chunk headroom ceiling (400 KB gzip) as an early-warning check. Budget numbers and check
shape live in .size-limit.json at the repo root. Wired `budgets` into ci.yml's script matrix so
a PR that breaks a budget fails CI (References amended to include .github/workflows/ci.yml,
flagged to the reviewer; branch protection / required status checks intentionally untouched).
Measured today: controller initial JS ~47.5-49.2 KB, Quick Draw controller chunk ~2.0 KB,
controller fonts ~20.1 KB, host platform JS ~400.8 KB, Phaser alone ~345.5-357.5 KB -- all
within budget. Deviated from the documented size-limit/@size-limit/preset-app library choice for
the actual measurement (its file-glob plugin can't disambiguate per-game chunks once filenames
collide across games); used Vite's own build output metadata instead, which is exact and needs
no maintained list. Rationale and measurements recorded in the task's implementation notes.
Reviewed by dipsaus-ai:story-reviewer: PASS (round 1), two advisory findings, one fixed
(wrong doc citation, corrected to README.md) and one left as a documented, low-risk gap.
<!-- SECTION:FINAL_SUMMARY:END -->
