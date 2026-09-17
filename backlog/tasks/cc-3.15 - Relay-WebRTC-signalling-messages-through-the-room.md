---
id: CC-3.15
title: Relay WebRTC signalling messages through the room
status: In Progress
assignee: []
created_date: '2026-09-17 17:50'
updated_date: '2026-09-17 20:56'
labels:
  - story
dependencies:
  - CC-3.12
references:
  - packages/protocol/src/messages/
  - packages/protocol/test/messages.test.ts
  - apps/server/src/room/rtc.ts
  - apps/server/src/room/room.ts
  - apps/server/test/rtc.test.ts
  - apps/server/test/headers.test.ts
  - apps/controller/src/session/state.ts
parent_task_id: CC-3
priority: high
type: feature
ordinal: 214000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Phones and the host can exchange rtc:offer and rtc:answer through the room, with protocol schemas for every link message (docs/architecture/realtime-link.md, Signalling and Channels).

Type: deliverable
Branch: CC-3.15/rtc-signalling-relay
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 @couchcade/protocol exports schemas for rtc:offer, rtc:answer, link:ping and link:pong, and input.d accepts optional n, e and more, with valid and invalid fixtures that encode under 1 KB
- [x] #2 The room forwards rtc:offer only from a seated player to the host with from set, and drops it from audience and host sockets (apps/server/test/rtc.test.ts)
- [x] #3 The room forwards rtc:answer only to the connected phone named in to, with to removed, and drops an unknown or disconnected target
- [x] #4 A test asserts the room makes no storage write for rtc messages
- [x] #5 A header test asserts the Content-Security-Policy never contains a webrtc 'block' directive
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Protocol (packages/protocol/src/messages/index.ts): add linkCandidateSchema/linkDescriptionSchema (compact WebRTC description, <=6 host candidates), rtcOfferPayloadSchema, rtcAnswerFromHostPayloadSchema/rtcAnswerToPhonePayloadSchema, linkPingPayloadSchema/linkPongPayloadSchema (standalone, never through the relay), and n/e/more optional fields on inputPayloadSchema. Wire rtc:offer into phoneToRelay+relayToHost (forwarded, from set) and rtc:answer into hostToRelay+relayToPhone (to stripped on the phone-facing side); extend senders (offer: player only, answer: host only). Fixtures + messages.test.ts catalogue/type updates. Server (apps/server/src/room/rtc.ts, new): pure answerTarget(phones, idOf, to) lookup, no storage access. room.ts: forward rtc:offer like input/ui:action (from = state.id); handle rtc:answer in #onHostMessage via answerTarget, stripping to. apps/server/test/rtc.test.ts (new): offer forwarding + audience/host drops + oversized drop; answer routing + unknown/disconnected drops + phone-sent drop; storage spy proving no write. headers.test.ts: add the webrtc 'block' trip-wire assertion (CSP already has no webrtc directive; nothing to change in headers.ts itself). Necessary glue outside References: apps/controller/src/session/state.ts's onMessage switch over RelayToPhoneMessage was exhaustive and broke on the new rtc:answer variant; added a no-op case (real handling is CC-3.19's WebRTC runtime). Verified apps/host's two message switches already have default/break fallthroughs, no change needed there.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check, pnpm test, pnpm build.

Dependency changed from CC-3.14 to CC-3.12 (orchestrator decision, 2026-09-17): CC-3.15 only needs the approved design doc (docs/architecture/realtime-link.md, Signalling section), not CC-3.14's doc-amendment edits to platform.md/security.md/etc. Waiting on CC-3.14 would also chain this story behind CC-3.13's owner-run spike for no reason -- the protocol schemas and room relay can be built and reviewed in parallel with the spike and the doc amendments. CC-3.14 itself is untouched and still depends on CC-3.13.

Amended References to add apps/controller/src/session/state.ts: adding rtc:answer to RelayToPhoneMessage made its onMessage switch non-exhaustive (vue-tsc build failure). Added a one-line no-op case (real handling is CC-3.19's link runtime, out of this story's scope). Checked apps/host's two RelayToHostMessage switches (lobby-state.ts, host-runtime.ts): both already have default/break fallthroughs, so rtc:offer needed no change there.
<!-- SECTION:NOTES:END -->
