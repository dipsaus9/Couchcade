---
id: CC-3.16
title: Build the WebRTC link core in @couchcade/game-sdk/link
status: To Do
assignee: []
created_date: '2026-09-17 17:50'
updated_date: '2026-09-17 17:50'
labels:
  - story
dependencies:
  - CC-3.14
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
- [ ] #1 encodeDescription and decodeDescription round-trip recorded Chrome, Safari and Firefox descriptions, keep only UDP host candidates (at most 6), and every encoded rtc:offer frame stays under 1,024 bytes
- [ ] #2 The link clock maths returns round trip and offset within 1 ms of the expected values for asymmetric test delays
- [ ] #3 Token buckets drop cc-stream frames above 130 per second (burst 40) and cc-events frames above 20 per second (burst 20), and a peer with more than 100 drops in 10 s is reported as cut off
- [ ] #4 Event de-duplication applies each event id once per player and remembers the last 64
- [ ] #5 Fake-timer tests cover the state machine: 5 s connect timeout, stale after 3 missed pongs (at least 750 ms), relay after 5 s stale, 10 s, 30 s and 90 s retry backoff, and at most 10 attempts per hour
- [ ] #6 createFakeLink({ delayMs, jitterMs, loss, dropAfterMs }) is exported from @couchcade/game-sdk/testing
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Recorded descriptions: capture one offer and one answer per engine (Playwright Chromium and WebKit, a local Firefox) with iceServers [] and store them as fixtures.
Verify: pnpm check, pnpm test, pnpm build.
<!-- SECTION:NOTES:END -->
