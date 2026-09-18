---
id: CC-3.21
title: Send aim samples through the input channel from createAimSender
status: Done
assignee: []
created_date: '2026-09-17 17:51'
updated_date: '2026-09-18 05:04'
labels:
  - story
dependencies:
  - CC-3.18
references:
  - packages/motion/src/gestures/aim.ts
  - packages/motion/test/aim/
  - games/target-range/src/controller/aim.ts
  - games/target-range/src/shared/input.ts
  - games/target-range/test/controller/aim.test.ts
parent_task_id: CC-3
priority: medium
type: feature
ordinal: 220000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Aim from the gyroscope and the drag pad goes out one sample at a time through input.stream with 3 decimals, so every aim game gets direct-link rates (docs/architecture/realtime-link.md, Game SDK API sketch).

Type: deliverable
Branch: CC-3.21/aim-sender-input-channel
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 createAimSender calls input.stream once per aim sample and no longer packs samples itself
- [x] #2 Aim values are rounded to 3 decimals
- [x] #3 A phone held still sends nothing: samples that moved less than the minimum step are skipped
- [x] #4 The existing aim detector and drag fallback tests pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. packages/motion/src/gestures/aim.ts: change createAimSender to take a Pick<InputChannel<TInput>, "stream"> (from @couchcade/game-sdk/contract) instead of Pick<InputStream, "set">. It no longer packs a rolling window or runs its own 15Hz timer (the channel now owns pacing/packing per realtime-link.md). It keeps the min-step skip (AIM_MIN_STEP) and calls channel.stream({ type, payload: { yaw, pitch } }, reading.t) once per accepted sample, values rounded to 3 decimals. Remove packAim/PackedAimSample/AIM_SAMPLES_PER_MESSAGE usage (dead once packing moves to the channel).
2. Bump createAimOutput's roundUnit from 2 to 3 decimals (doc's Found-while-writing row 2 names this exact function as the fix point) and AIM_MIN_STEP from 0.01 to 0.001 to match the new precision quantum (doc: "0.001 of yaw is 0.2 world px").
3. packages/motion/test/aim/: update sender.test.ts to the new channel-based rig and ACs (no packing/pacing); update detector.test.ts and drag.test.ts numeric expectations for 3-decimal rounding (values recomputed, not just relaxed).
4. Compatibility shim (outside References, unavoidable due to the breaking signature change, the sole current caller): games/target-range/src/controller/aim.ts's createShotAim wraps createAimSender with an adapter object literal - update it from { set } to { stream } shape, re-packing the single sample into the existing wire format ({ aim: [[0, yaw, pitch]] }) so target-range's schema/behaviour/tests are unaffected until CC-11.9 migrates it properly. Drop the now-unused now/schedule options forwarding (AimSenderOptions shrinks to { type? }), fixing the one test call site in games/target-range/test/controller/aim.test.ts that passed them.
5. Run pnpm check, pnpm test, pnpm build at the repo root before every commit.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check, pnpm test, pnpm build.

Implementation: createAimSender now takes Pick<InputChannel<TInput>, "stream"> (@couchcade/game-sdk/contract) instead of Pick<InputStream, "set">. It calls channel.stream once per accepted sample, rounded to 3 decimals, and no longer owns a timer or a packing window (that pacing/packing now lives entirely in createInputChannel, CC-3.18). createAimOutput's roundUnit moved from 2 to 3 decimals (this is the exact fix point the doc's "Found while writing" row 2 names), and AIM_MIN_STEP moved from 0.01 to 0.001 to match the new precision quantum ("0.001 of yaw is 0.2 world px"). packAim/PackedAimSample/AIM_SAMPLES_PER_MESSAGE usage was removed from aim.ts as dead code once packing moved to the channel.

Necessary out-of-References compatibility fix: games/target-range is the sole current caller of createAimSender and wraps the old InputStream directly (its own migration to InputChannel is CC-11.9, which depends on this story). Changing createAimSender's parameter shape is an unavoidable breaking change for that caller, so games/target-range/src/controller/aim.ts's adapter was updated from {set} to {stream}, re-packing each single sample into the existing wire format ({ aim: [[0, yaw, pitch]] }) so target-range's schema, wire behaviour and tests are unaffected (all 147 target-range tests pass unchanged in behaviour). AimSenderOptions dropped now/schedule (no longer needed), so the one test call site that passed them (games/target-range/test/controller/aim.test.ts) was updated to stop passing them. games/target-range/src/shared/input.ts got a one-line comment update pointing at the new packing location. No target-range behaviour, schema or References changed. This shim is temporary and CC-11.9 removes it when target-range moves onto the InputChannel and the single-sample aim input per the doc's Game SDK API sketch.

Verify: pnpm check, pnpm check:deps, pnpm check:style, pnpm test, pnpm build all green at the repo root (motion: 225/225 tests, target-range: 147/147 tests, full workspace: no failures).

Review round 1 (dipsaus-ai:story-reviewer, model sonnet): verdict BLOCK. All 4 acceptance criteria judged met (createAimSender calls channel.stream once per sample; 3-decimal rounding; min-step skip; detector/drag tests pass, 225/225 motion tests green, typecheck clean). The block is scopeViolations: the 3 games/target-range/ files touched by the necessary compatibility shim (see prior note) fall outside CC-3.21's declared References.

Tried the reviewer's suggested fix (widen References to include the 3 target-range paths) and it created a real collision: `backlog-workflow.ts collisions CC-3.21` reports CC-3.21 colliding with CC-11.9 (References games/target-range/src/, games/target-range/test/, e2e/games/target-range.spec.ts) once those paths are added — exit 1, a hard gate per the readiness-gate rules. Reverted the References back to the original two paths; no collision now, but the review-gate scope violation stands unresolved. This is a genuine structural bind the story split didn't anticipate: CC-3.21's own required signature change (AC 1: InputChannel-shaped parameter) has exactly one caller in the whole repo, games/target-range, and CI (pnpm build/test at the repo root) cannot pass without adapting that caller -- yet CC-11.9 (Target Range's own migration to the InputChannel) already claims the same files in its own References and depends on CC-3.21, so widening CC-3.21's References to cover them collides with CC-11.9's declared scope.

Escalating rather than forcing either hard gate. Work is committed on the branch (not pushed): commit 1 is the pure packages/motion change (in-References, reviewer-approved on the merits), commit 2 is the isolated, minimal, behavior-preserving target-range compatibility shim (3 files, no schema/behaviour change, target-range's own 147 tests pass unchanged). Status left In Progress pending a decision.

Owner/orchestrator decision (relayed 2026-09-18): approved re-widening References to include the 3 games/target-range/ compatibility-shim files (the reviewer's own suggested fix from round 1), and to treat the resulting overlap with CC-11.9's References (games/target-range/src/, games/target-range/test/, e2e/games/target-range.spec.ts) as an accepted, dependency-ordered exception, not a real collision: CC-11.9 depends on CC-3.21 and is not claimed, so the two can never be in flight at the same time -- the same call the owner made earlier for CC-7.5 versus CC-11.9. `backlog-workflow.ts collisions` will still report this pair while CC-11.9 sits in To Do; that is expected and not a signal to stop.

Follow-up for CC-11.9's future worker: games/target-range/src/controller/aim.ts's createShotAim already adapts createAimSender with a { stream: ... } object (re-packing one sample into the old wire array) as of this story, not the original { set: ... } form. CC-11.9 removes this shim entirely when it moves Target Range onto the InputChannel and the single-sample aim input -- start from the { stream } adapter, not { set }.

Review round 2 (dipsaus-ai:story-reviewer, model sonnet), after the References widening was approved: verdict PASS. All 4 acceptance criteria met, scopeViolations empty, no findings. Proceeding to close-out: merge origin/main, re-verify, push, draft PR.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
createAimSender now streams every accepted aim sample through the game's InputChannel.stream() (one call per sample, 3 decimals), instead of packing a rolling window and pacing itself -- that pacing/packing now lives entirely in createInputChannel (CC-3.18), per docs/architecture/realtime-link.md's Game SDK API sketch. createAimOutput's rounding moved from 2 to 3 decimals (the doc's diagnosed fix for the far-target resolution bug) and AIM_MIN_STEP moved from 0.01 to 0.001 to match. games/target-range, the sole current caller, got a minimal, behavior-preserving compatibility shim (its own 147 tests pass unchanged) since its own migration to the InputChannel is CC-11.9. Reviewed pass in round 2 after References were widened, by owner approval, to declare that shim's footprint.
<!-- SECTION:FINAL_SUMMARY:END -->
