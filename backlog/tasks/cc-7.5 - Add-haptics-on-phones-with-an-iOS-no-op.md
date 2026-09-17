---
id: CC-7.5
title: Add haptics on phones with an iOS no-op
status: Done
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-17 21:29'
labels:
  - story
dependencies:
  - CC-7.1
  - CC-4.4
references:
  - packages/ui/src/haptics/
  - packages/ui/test/haptics/
  - packages/ui/package.json
  - games/quick-draw/src/controller/haptics.ts
  - games/quick-draw/src/controller/Controller.vue
  - games/quick-draw/test/controller/haptics.test.ts
  - games/target-range/src/controller/haptics.ts
  - games/target-range/src/controller/Controller.vue
parent_task_id: CC-7
type: feature
ordinal: 91000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Android phones buzz on key moments.

Type: deliverable
Branch: CC-7.5/phone-haptics
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 haptic("your-turn") etc. call navigator.vibrate when available and do nothing otherwise
- [x] #2 Unit test covers the no-vibrate path
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Build @couchcade/ui/haptics (packages/ui/src/haptics/index.ts): hapticPatterns map, canVibrate(), haptic(token) per docs/architecture/audio.md 'Phone haptics'. Add @couchcade/protocol as a packages/ui dependency for CueToken. Add a browser-mode unit test at packages/ui/test/haptics/haptics.test.ts covering every pattern, the no-vibrate path and a throwing navigator.vibrate. Delete games/quick-draw/src/controller/haptics.ts and games/target-range/src/controller/haptics.ts, move Quick Draw's test/controller/haptics.test.ts content into the new package test, and repoint both games' Controller.vue at haptic() from @couchcade/ui/haptics instead of the local playCue(). Verify with pnpm check, pnpm check:deps, pnpm test, pnpm build.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test

Amended References per docs/architecture/audio.md Conflicts item 2 (doc rule, owner-approved 2026-09-17): added both games' controller haptics.ts, Controller.vue and Quick Draw's haptics test, since the approved doc requires deleting the game copies and wiring Controller.vue to @couchcade/ui/haptics as part of this story.

Accepted collision (orchestrator decision, 2026-09-17): CC-7.5's amended References (games/quick-draw/src/controller/haptics.ts, games/quick-draw/src/controller/Controller.vue, games/quick-draw/test/controller/haptics.test.ts, games/target-range/src/controller/haptics.ts, games/target-range/src/controller/Controller.vue) prefix-collide with CC-11.9's broad reference games/target-range/src/. CC-11.9 is not claimed (no branch/worktree) and is blocked behind CC-3.17, CC-3.18 and CC-3.21, all still To Do, so it cannot be dispatched tonight. Orchestrator will hold CC-11.9 until this story's PR merges. Proceeding with delivery on this basis; reviewer should treat the games/target-range/src/controller/ touches as in-scope and the collision as knowingly accepted, not an oversight.

Reviewer round 1 flagged packages/ui/package.json (new @couchcade/protocol dependency needed for CueToken) and packages/ui/test/haptics/ (the new module's own test dir, a sibling of the declared packages/ui/src/haptics/, not a prefix match) as scope violations. Both are inherent to shipping packages/ui/src/haptics/ (a manifest edit for its one new import, and its own test directory), not new functional scope, so amended References to include them explicitly, matching the doc's own convention (audio.md Conflicts item 7) of amending References for a declared deliverable's necessary companion paths.

Reviewer (dipsaus-ai:story-reviewer, model sonnet) round 2: pass. Both acceptance criteria met, no scope violations, no findings. (Round 1 blocked on packages/ui/package.json and packages/ui/test/haptics/ missing from References; fixed by amending References, see prior note.)
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added @couchcade/ui/haptics (packages/ui/src/haptics/index.ts): hapticPatterns, canVibrate() and haptic(token), wrapping navigator.vibrate with a try/catch no-op where unsupported (iPhone, Firefox for Android), per docs/architecture/audio.md 'Phone haptics'. Covered by a browser-mode unit test at packages/ui/test/haptics/haptics.test.ts (every pattern, the no-vibrate path, a throwing navigator.vibrate). Per the doc's Conflicts item 2 (owner-approved), also deleted the duplicate haptics.ts in games/quick-draw and games/target-range and repointed both games' Controller.vue to the shared haptic(); Quick Draw's old haptics test moved into the new package test. References were amended to add both games' haptics.ts/Controller.vue/test paths; this created a declared-References collision with CC-11.9 (games/target-range/src/), accepted by the orchestrator since CC-11.9 is unclaimed and blocked behind undone dependencies (CC-3.17/18/21).
<!-- SECTION:FINAL_SUMMARY:END -->
