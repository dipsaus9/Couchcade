---
id: CC-1.7
title: Build packages/utils with room codes and a seeded RNG
status: Done
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 15:54'
labels:
  - story
dependencies:
  - CC-1.5
references:
  - packages/utils/
  - pnpm-lock.yaml
parent_task_id: CC-1
type: feature
ordinal: 30000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Pure helpers every package can use: room codes and deterministic randomness.

Type: deliverable
Branch: CC-1.7/utils-package
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 roomCode() returns 4 uppercase letters without ambiguous letters (I, O)
- [x] #2 createRng(seed) returns the same sequence for the same seed (unit test)
- [x] #3 package.json exports use a wildcard subpath pattern so later helpers need no package.json edits
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Scaffold packages/utils (@couchcade/utils): private, type module, sideEffects false, exports '.' + './*' -> ./src/*/index.ts (platform.md wildcard rule), tsconfig extends @couchcade/config/tsconfig/lib.json, vitest.config via defineLibConfig, devDeps from catalog (typescript, vitest, fast-check). No runtime dependencies (tier 0).
2. src/rng: createRng(seed) on mulberry32 (one uint32 of state, so it fits JSON TState); next/int/pick/shuffle plus a state getter where createRng(rng.state) resumes the sequence. Known-value test pins the algorithm; fast-check properties for same-seed determinism, ranges, resume and shuffle.
3. src/room-code: ROOM_CODE_ALPHABET (A-Z without I and O), roomCode(rng?) using crypto.getRandomValues with rejection sampling by default or an injected Rng, isRoomCode(). Tests incl. fast-check.
4. Test that package.json exports keep the wildcard pattern and every src/<module>/index.ts resolves through it.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test

RNG is mulberry32 (pinned output for seed 42 matches the reference implementation). State is one uint32, so createRng(rng.state) resumes a sequence stored in TState. roomCode() uses crypto.getRandomValues with rejection sampling by default (unpredictable for the Worker) and accepts a seeded Rng for tests. Not done, out of scope: a rude-word filter for room codes (story and platform.md only require no I/O).

Review round 1: block. All 3 criteria met; the only scope violation was pnpm-lock.yaml, which pnpm install regenerates when a workspace package is added (platform.md: lockfiles are committed, never hand-edited). References amended through the CLI to add pnpm-lock.yaml. Advisory: none needing action.

Review round 2: pass. All 3 criteria met, no scope violations, no findings.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added @couchcade/utils (tier 0, no runtime dependencies) with wildcard subpath exports ('.' and './*' -> ./src/*/index.ts, pinned by a test that also imports the subpaths by package name). @couchcade/utils/rng: createRng(seed) on mulberry32 with next/int/pick/shuffle and a uint32 state getter, so games store rng.state in JSON TState and resume with createRng(state); output for seed 42 is pinned against the reference algorithm, and fast-check properties cover same-seed determinism, resume, ranges and shuffle. @couchcade/utils/room-code: ROOM_CODE_ALPHABET (A-Z without I and O), roomCode() from crypto.getRandomValues with rejection sampling (or a seeded Rng for tests) and isRoomCode(). 26 tests.
<!-- SECTION:FINAL_SUMMARY:END -->
