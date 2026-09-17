---
id: CC-3.17
title: Add stream playback with prediction to @couchcade/game-sdk/input
status: Done
assignee: []
created_date: '2026-09-17 17:50'
updated_date: '2026-09-17 21:04'
labels:
  - story
dependencies:
  - CC-3.14
  - CC-3.16
references:
  - packages/game-sdk/src/input/playback.ts
  - packages/game-sdk/src/input/aim-playback.ts
  - packages/game-sdk/src/input/index.ts
  - packages/game-sdk/test/input/playback.test.ts
parent_task_id: CC-3
priority: high
type: feature
ordinal: 216000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The TV draws any numeric stream smoothly on both paths: interpolation, brief prediction past the newest sample, catch-up without jumps and a snap to a shot's value (docs/architecture/realtime-link.md, Fallback detection and smoothing).

Type: deliverable
Branch: CC-3.17/stream-playback-prediction
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 addSample and createPlayback are exported from @couchcade/game-sdk/input and work on plain JSON tracks
- [x] #2 Replaying a recorded aim trace through createFakeLink at 4 messages per second with 30 to 100 ms delay, 20 ms jitter and 2% loss gives p90 error under 6 world px, no overshoot beyond 4 px after the aim stops, and no stall over 150 ms while the aim moves
- [x] #3 The same replay with direct-path settings (30 per second, delay from measured jitter) gives p90 error under 2 world px
- [x] #4 snap moves the drawn value to a given value over 60 ms
- [x] #5 aimAt keeps its signature and its existing tests pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. packages/game-sdk/src/input/playback.ts: generic Sample/SampleTrack types, addSample (append+dedupe by atMs, sort, cap at maxPoints=64), createPlayback({predictMs=100, tauMs=60, catchUpMs=50}) returning {at, snap}: at() = interpolate between bracketing samples with a hold across a gap longer than the track's own typical interval (median of consecutive deltas), predict past the newest sample with 3-sample velocity eased over tauMs up to predictMs then hold, clamp predicted values to [-1,1], then ease the drawn value toward that target with catchUpMs (first call jumps, no lag); snap() tweens the drawn value linearly to a given value over overMs (default 60), then resumes normal catch-up from there.
2. packages/game-sdk/src/input/aim-playback.ts: reimplement aimAt as a thin wrapper: build a fresh createPlayback({predictMs:0}) per call (stateless like today) and call .at(track, nowMs, delayMs, 0) so it always jumps straight to the interpolated/held target with no prediction and no catch-up lag, matching today's exact behaviour and keeping every existing aim-playback.test.ts assertion green. addAimSamples is untouched (relay packing is a separate concern).
3. packages/game-sdk/src/input/index.ts: re-export playback.ts.
4. packages/game-sdk/test/input/playback.test.ts: unit tests for addSample and createPlayback (interpolation, hold-across-gap, prediction+clamp, catch-up, snap timing) plus the doc's "Proving it" replay: a synthetic 2D aim-like trace (since no packages/motion/test/traces/ recordings exist yet) driven through createFakeLink from @couchcade/game-sdk/testing at (a) 4 msg/s, 30-100ms delay, 20ms jitter, 2% loss -> assert p90 error < 6 world px, overshoot <= 4px after the trace stops, no stall > 150ms while it moves, and (b) 30 msg/s with delay derived from measured jitter -> assert p90 error < 2 world px. World px uses the existing 200 px-per-unit scale (Target Range's yaw range) since the aim value range is -1..1.
5. Run pnpm check, pnpm test, pnpm build; check off ACs as each is objectively met.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Use the recorded aim traces in packages/motion/test/traces/ when available, else a synthetic trace.
Verify: pnpm check, pnpm test, pnpm build.

Blocker found at intake: CC-3.16 (link core + createFakeLink) is NOT merged despite the orchestrator brief saying it was — PR #120 is still open (CI green, mergeStateStatus DIRTY vs current main). Worked around it by cutting this story's branch from origin/CC-3.16/webrtc-link-core instead of main (a stacked branch), so the link core and createFakeLink actually exist to build and test against. Flagged to the orchestrator in the handback; recommend merging CC-3.16 first, then this PR's base auto-retargets to main once that branch is deleted.

Design decisions taken (doc is a "sketch, not a final signature" for this API):
- createPlayback gets an extra `intervalMs` option beyond the doc's predictMs/tauMs/catchUpMs sketch. Needed because aimAt must keep its exact legacy output (AC5) including a 2-point track with a large gap, which only works with the stream's known nominal interval, not one inferred from a short/sparse track. aimAt passes its fixed 15 Hz interval explicitly; a caller that knows its stream's hz (e.g. the future InputChannel, CC-3.18) should do the same.
- No recorded traces exist yet in packages/motion/test/traces/ (CC-5.9 only ships the recorder tool, no committed fixtures), so the "Proving it" test uses a synthetic 2D trace per this story's implementation notes, built to start and end each axis at rest (a raised-cosine bump) so the "no overshoot after the aim stops" check isn't fighting an artificial instant freeze mid-swing.
- Relay-path playback delay tuned to 280ms (top of the doc's stated 120-280ms tuning range) rather than the 180ms starting guess, because at 4 msg/s with up to 120ms of network latency, 180ms is often outrun by real message age and produced up to 240ms stalls in the replay. This replay test is exactly the tuning mechanism the doc calls for; 280ms clears all three AC2 thresholds (p90 < 6px, overshoot <= 4px, no stall > 150ms) across base delays 30/65/100ms with 20ms jitter and 2% loss.
- World px scale for the replay test: 200 px per unit of aim (-1..1), matching Target Range's yaw range from the tuning section, since this is a generic library with no built-in px scale of its own.

Collision check (bun backlog-workflow.ts collisions CC-3.17) flagged CC-3.18 (To Do, no branch, no worktree) over shared input/index.ts — expected per the doc's own dependency-ordering note ("CC-3.17 before CC-3.18"), not a live collision.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added generic stream playback with prediction to @couchcade/game-sdk/input: addSample (append/dedupe/cap a plain-JSON sample track) and createPlayback (interpolate, hold across a gap, predict briefly past the newest sample with eased, clamped velocity, catch up without jumping, and snap to an exact value over a short tween), from docs/architecture/realtime-link.md 'Fallback detection and smoothing'. aimAt is now a thin, stateless wrapper over createPlayback (prediction off, its fixed 15 Hz interval passed explicitly) and keeps its exact legacy behaviour; addAimSamples is untouched. A new packages/game-sdk/test/input/playback.test.ts unit-tests addSample and every createPlayback behaviour directly, plus the doc's 'Proving it' replay: a synthetic 2D aim trace driven through createFakeLink (CC-3.16) at 4 msg/s (30-100ms base delay x3, 20ms jitter, 2% loss, 280ms playback delay - tuned within the doc's 120-280ms range) and at 30 msg/s (delay from the direct-path jitter formula), asserting p90 error under 6/2 world px, no overshoot beyond 4px after the aim stops, and no stall over 150ms while it moves. Built on CC-3.16's branch since PR #120 is not yet merged despite being marked so (see task notes and delivery report). pnpm check, pnpm test, pnpm build and pnpm check:deps all pass.
<!-- SECTION:FINAL_SUMMARY:END -->
