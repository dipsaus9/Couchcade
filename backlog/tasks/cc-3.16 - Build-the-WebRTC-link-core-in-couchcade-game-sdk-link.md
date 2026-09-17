---
id: CC-3.16
title: Build the WebRTC link core in @couchcade/game-sdk/link
status: Done
assignee: []
created_date: '2026-09-17 17:50'
updated_date: '2026-09-17 20:36'
labels:
  - story
dependencies:
  - CC-3.12
references:
  - packages/game-sdk/src/link/
  - packages/game-sdk/test/link/
  - packages/game-sdk/testing/fake-link.ts
  - packages/game-sdk/testing/index.ts
parent_task_id: CC-3
priority: high
type: feature
ordinal: 215000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Pure, DOM-free link pieces both apps share: the compact description codec, link clock maths, TV-side token buckets, event de-duplication, the link state machine and a fake link for tests (docs/architecture/realtime-link.md).

Type: deliverable
Branch: CC-3.16/webrtc-link-core
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 encodeDescription and decodeDescription round-trip recorded Chrome, Safari and Firefox descriptions, keep only UDP host candidates (at most 6), and every encoded rtc:offer frame stays under 1,024 bytes
- [x] #2 The link clock maths returns round trip and offset within 1 ms of the expected values for asymmetric test delays
- [x] #3 Token buckets drop cc-stream frames above 130 per second (burst 40) and cc-events frames above 20 per second (burst 20), and a peer with more than 100 drops in 10 s is reported as cut off
- [x] #4 Event de-duplication applies each event id once per player and remembers the last 64
- [x] #5 Fake-timer tests cover the state machine: 5 s connect timeout, stale after 3 missed pongs (at least 750 ms), relay after 5 s stale, 10 s, 30 s and 90 s retry backoff, and at most 10 attempts per hour
- [x] #6 createFakeLink({ delayMs, jitterMs, loss, dropAfterMs }) is exported from @couchcade/game-sdk/testing
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Pure, DOM-free link core in packages/game-sdk/src/link/, mirroring the clock/ module's style
(factory functions, ClockScheduler-style fake-timer injection, doc comments citing
docs/architecture/realtime-link.md):

- description.ts: encodeDescription/decodeDescription. Regex-parses ice-ufrag, ice-pwd,
  sha-256 fingerprint and UDP host a=candidate lines out of a raw SDP string; drops TCP and
  non-host candidates, truncates to 6; compacts the fingerprint from hex-colon to base64url
  (32 bytes -> 43 chars) via hand-rolled base64 (no DOM lib, so no btoa assumption beyond the
  same globalThis-cast trick room-clock.ts already uses). decodeDescription rebuilds a
  minimal but valid SDP from the fixed template (rule 1) for offer/answer roles.
- clock.ts: linkClockSampleOf({t0,t1,t2,t3}) and linkOffsetToRoom(offsetPH, r), the NTP-style
  maths from "Refining a phone's clock over the link".
- buckets.ts: createTokenBucket (generic, refills from arrival time, no timer) and
  createLinkGuard combining the cc-stream (130/s burst 40) and cc-events (20/s burst 20)
  buckets with a 10s/100-drop cut-off tracker.
- dedupe.ts: createEventDedupe, a per-player FIFO+Set remembering the last 64 event ids.
- state-machine.ts: createLinkStateMachine, the off/connecting/direct/stale/relay machine from
  the mermaid diagram: 5s connect timeout, promote on channels-open + 3 pongs, stale after
  max(3*pingIntervalMs, 750ms) with no pong, relay after 5s stale, 10/30/90s auto-retry
  backoff then trigger-only, 10 attempts/hour rolling budget shared across start/retry/auto.

Recorded fixtures: captured real offer/answer SDP from Playwright Chromium, Firefox and WebKit
(iceServers: [], negotiated cc-stream/cc-events channels, iceGatheringState complete) via a
throwaway scratchpad script, stored as test/link/fixtures/*.ts. WebKit gathered zero
candidates in this sandbox (no route to enumerate local interfaces headless) -- that fixture
still round-trips u/p/f with an empty candidate list, which is itself a valid codec case; a
synthetic multi-candidate SDP fixture separately proves the 6-candidate truncation and
UDP/host filtering (needed since none of the three live captures had >1 candidate).

testing/fake-link.ts: createFakeLink({delayMs, jitterMs, loss, dropAfterMs, now?, schedule?,
random?}) returns {a, b, close()}, two FakeLinkSide (send/onMessage/bufferedAmount) wired
through the same ClockScheduler-shaped scheduler so tests run on fake timers.

Tests in packages/game-sdk/test/link/ per module, using test/clock/virtual-time.ts's
createVirtualTime() for fake-timer control (already generic, reused as-is).

Out of scope (later stories per the doc's story table): protocol schemas (CC-3.15), the
input channel/relay packing (CC-3.17/18), and the actual RTCPeerConnection browser wiring
(CC-3.19/20) -- this story only builds the pure core they'll sit on.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Recorded descriptions: capture one offer and one answer per engine (Playwright Chromium and WebKit, a local Firefox) with iceServers [] and store them as fixtures.
Verify: pnpm check, pnpm test, pnpm build.

Dependency changed from CC-3.14 to CC-3.12 (orchestrator decision, 2026-09-17): the link core (description codec, clock maths, token buckets, event de-duplication, state machine, createFakeLink) is fully specified in the approved docs/architecture/realtime-link.md and doesn't need CC-3.14's doc-amendment edits to platform.md/security.md/etc. Waiting on CC-3.14 would also chain this story behind CC-3.13's owner-run spike for no reason -- the SDK link core can be built and reviewed in parallel with the spike and the doc amendments. CC-3.14 itself is untouched and still depends on CC-3.13.

Recorded fixtures captured live: launched Playwright Chromium, Firefox and WebKit (installed
firefox-1543 for this repo's pinned Playwright), created a negotiated cc-stream(0)/cc-events(1)
RTCPeerConnection pair with iceServers: [], waited for iceGatheringState "complete", and saved
localDescription.sdp for one offer and one answer per engine. WebKit gathered zero host
candidates in this headless sandbox (iceGatheringState stuck at "gathering", no error event) --
likely no enumerable local interface inside this environment's WebKit process. That SDP is still
kept as the Safari fixture (valid ufrag/pwd/fingerprint, empty candidate list) since it's a real,
valid description and exercises the codec's empty-list path; the 6-candidate truncation and
UDP/host filtering are covered by a synthetic multi-candidate SDP instead, since none of the 3
live captures happened to gather more than one candidate. Firefox's capture did include a TCP
candidate alongside its UDP one, which nicely exercises the "drop non-UDP" rule for real.

Dependency note: this story's recorded dependency (CC-3.14) is still To Do (it in turn depends on
CC-3.13, also To Do); another worker's CC-3.13 delivery is expected to change CC-3.16's dependency
to CC-3.12 (Done), per the orchestrator. Proceeded on the orchestrator's explicit override since
this build only needed docs/architecture/realtime-link.md (already approved, CC-3.12), not the
amended platform/security/session-flow/motion/TECH_STACK docs CC-3.14 would touch.

Reviewer (dipsaus-ai:story-reviewer, model sonnet, round 1): verdict PASS. All 6 acceptance
criteria met, no scope violations. One advisory finding: fixtures/recorded.ts's doc comment
referenced a nonexistent synthetic.ts file for the truncation/UDP-host-filter tests (they're
actually inline in description.test.ts). Fixed in a follow-up commit; no re-review needed for an
advisory-only, non-blocking comment fix.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Built the pure, DOM-free WebRTC link core in @couchcade/game-sdk/link per docs/architecture/realtime-link.md:
description.ts (compact session description codec, round-tripped against live-captured Chrome,
Firefox and WebKit SDP fixtures, UDP-host-only filtering, 6-candidate truncation, sub-1KB frames),
clock.ts (link ping/pong clock maths), buckets.ts (cc-stream 130/s burst-40 and cc-events 20/s
burst-20 token buckets with a 10s/100-drop cut-off), dedupe.ts (per-player 64-id event dedupe),
and state-machine.ts (the off/connecting/direct/stale/relay lifecycle with 5s connect timeout,
750ms-floored staleness, 5s stale-to-relay, 10/30/90s retry backoff and a 10-attempts-per-hour
budget, all on fake timers). Added createFakeLink to @couchcade/game-sdk/testing. 254 tests across
18 files in packages/game-sdk pass; pnpm check, pnpm test and pnpm build are green repo-wide.
Reviewed by dipsaus-ai:story-reviewer (pass, round 1; one advisory doc-comment fix applied).
<!-- SECTION:FINAL_SUMMARY:END -->
