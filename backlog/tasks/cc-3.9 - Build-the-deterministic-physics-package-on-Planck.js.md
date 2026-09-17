---
id: CC-3.9
title: Build the deterministic physics package on Planck.js
status: Done
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 23:21'
labels:
  - story
dependencies:
  - CC-3.1
  - CC-1.5
references:
  - packages/physics/
parent_task_id: CC-3
type: feature
ordinal: 58000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Physics games share one tested, deterministic 2D physics wrapper.

Type: deliverable
Branch: CC-3.9/physics-package
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 packages/physics wraps a Planck.js world with a fixed step
- [x] #2 The same inputs produce the same final positions across runs (unit test)
- [x] #3 Helpers exist for circle bodies, walls and friction
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Scaffold packages/physics (@couchcade/physics, core tier) with planck from the catalog (already pinned ^1.5.0).
2. Implement the session-flow.md API: BodyState/Push/WorldSpec types, stepWorld(spec, bodies, pushes) that rebuilds a Planck world every call (bodies sorted by id with code-unit order, warm starting and sleep off, fixed 1/60 s, 8/3 iterations) and returns bodies in input order plus sorted contact pairs; -0 normalised so JSON round trips are exact.
3. Helpers: circleBody, wallLoop, wallSegment, wallPath (open polylines for terrain/course edges), floorFriction (damping from a speed half-life, the top-down friction model).
4. Tests: 600-step determinism across runs, JSON round trip every step, fast-check property over random scenes, history independence (stepping after unrelated sims), each helper, validation errors.
5. Verify pnpm install --frozen-lockfile, check, check:deps, check:style, test, build.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test

Implementation (4c76e5a): packages/physics follows the session-flow.md API (stepWorld(spec, bodies, pushes), BodyState/Push/WorldSpec, circleBody, wallLoop, wallSegment) with small additions for the physics games: wallPath (open polylines for Lob Squad terrain and course edges), floorFriction(halfLifeMs) (top-down floor friction as damping, rule 5), CircleBodySpec.bullet (fast ball into pins), separate angularDamping, optional wall ids for contacts. Contacts are the pairs that touched during the step (begin-contact events inside the one-step world), not only those still touching after it, so a bounce is never missed. Output never holds -0 so JSON round trips are exact. Planck 1.5.0 was already in the catalog.

Review gate (dipsaus-ai:story-reviewer, round 1): pass. AC1-3 met, no scope violations, no findings.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added @couchcade/physics (packages/physics), a core-tier deterministic 2D physics package on Planck.js 1.5. stepWorld(spec, bodies, pushes) rebuilds a Planck world from plain JSON BodyState on every call (walls in spec order, bodies sorted by id in code-unit order, warm starting and sleep off), steps exactly 1/60 s with 8/3 iterations, and returns bodies in input order plus sorted contact pairs; -0 is normalised so JSON round trips are exact. Helpers: circleBody, wallSegment, wallPath, wallLoop and floorFriction (floor friction as damping from a speed half-life). 59 tests: 600-step determinism across runs for bowling, sumo and artillery scenes, JSON round trip every step, save half way and resume, history and body-order independence, a fast-check property over random worlds, plus helper and validation tests.
<!-- SECTION:FINAL_SUMMARY:END -->
