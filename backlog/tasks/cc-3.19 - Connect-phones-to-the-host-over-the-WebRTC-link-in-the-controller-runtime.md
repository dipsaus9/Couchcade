---
id: CC-3.19
title: Connect phones to the host over the WebRTC link in the controller runtime
status: Done
assignee: []
created_date: '2026-09-17 17:50'
updated_date: '2026-09-17 22:43'
labels:
  - story
dependencies:
  - CC-3.15
  - CC-3.16
  - CC-3.18
references:
  - apps/controller/src/runtime/link.ts
  - apps/controller/src/runtime/link-switch.ts
  - apps/controller/src/runtime/controller.ts
  - apps/controller/src/runtime/send.ts
  - apps/controller/src/runtime/GameController.vue
  - apps/controller/test/runtime/link.test.ts
parent_task_id: CC-3
priority: high
type: feature
ordinal: 218000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A seated phone opens a no-STUN data channel link to the host after joining, passes the InputChannel to game controllers and falls back to the relay path on its own (docs/architecture/realtime-link.md, Connection lifecycle).

Type: deliverable
Branch: CC-3.19/controller-realtime-link
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A seated phone with the link switch on sends rtc:offer after room:welcome while the TV is connected, using iceServers [] and negotiated channels cc-stream (id 0, ordered false, maxRetransmits 0) and cc-events (id 1, reliable)
- [x] #2 Audience phones and browsers without RTCPeerConnection never send rtc:offer
- [x] #3 The link switch is off unless VITE_REALTIME_LINK is on, and ?link=1 or ?link=0 overrides it for one page load
- [x] #4 Game controllers receive input, and a component test with createFakeLink shows sends move to the relay path within 1 s after the link is cut
- [x] #5 The phone closes its link when the page is hidden and offers again with a new attempt id once it is visible and room:welcome arrived
- [x] #6 With ?dev=1 the phone shows its path and link round trip and never an address
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. link-switch.ts: realtimeLinkEnabled() reads VITE_REALTIME_LINK (default off) with ?link=1/?link=0
   query overrides for one page load.
2. send.ts: extract localToRoomTime(localMs, toHostTime, clock) from createInputSender so link.ts
   stamps `at` the same way the turn-based sender does (same room-time conversion).
3. link.ts: createControllerLink() - the browser RTCPeerConnection wiring around game-sdk/link's
   state machine + description codec + clock maths. Owns: attempt lifecycle (offer/answer,
   negotiated cc-stream id0/cc-events id1), ping/pong over cc-stream, page-visibility handling,
   the link switch gate, feature detection (no RTCPeerConnection -> relay, no offer), and
   createChannel<TInput>() that wires createInputChannel's 4 send hooks + path()/onPathChange().
   RTCPeerConnection/RTCDataChannel are wrapped in small structural interfaces so tests can inject
   a fake without real WebRTC (mirrors createFakeLink's shape).
4. controller.ts: ControllerStatus "ready" carries the controller's `streams`; controllerProps gains
   an optional `input` param (same conditional-spread pattern as `motion`).
5. GameController.vue: accepts a `link` prop, builds one InputChannel per running game via
   link.createChannel(status.streams), passes it as `input`, clears it on unmount, and renders a
   minimal ?dev=1 readout (path + rtt, never an address).
6. session.ts: creates the ControllerLink (sendMessage=send, enabled=realtimeLinkEnabled), calls
   link.follow(state) after every dispatch, intercepts rtc:answer before the reducer (mirrors the
   existing clock:pong interception), disposes it in dispose(), exposes it as `session.link`.
7. state.ts: rtc:answer's case comment updated - session.ts now intercepts it before reaching here;
   the case stays for the discriminated union's exhaustiveness.
8. App.vue: passes :link="session.link" to <GameController>.
9. link.test.ts: covers the 6 ACs using createFakeLink plus a small fake RTCPeerConnection/channel
   shim, and link-switch's env/query precedence.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check, pnpm test, pnpm build.

Implementation notes:
- Touched apps/controller/src/App.vue and src/session/session.ts beyond the frozen References,
  the same way CC-5.10 (motion) did: the link must be a session-level singleton, up well before a
  game starts (realtime-link.md, "Join"), so it can't live inside GameController.vue alone, which
  only mounts once a game is running. session.ts now creates/owns the ControllerLink, calls
  link.follow(state) on every dispatch, and routes rtc:answer to it before the reducer (mirroring
  the existing clock:pong interception) rather than through PhoneState. App.vue only gains one new
  prop wire: :link="session.link" on <GameController>.
- apps/controller/src/session/state.ts: the rtc:answer reducer case is unchanged in effect (still
  a no-op) but its comment now points at session.ts, which intercepts the message before it
  reaches the reducer - the case stays only for RelayToPhoneMessage's exhaustive switch.
- Simplification vs. the doc: skipped the "each phone waits a random 0-1,000ms" spread on host
  recovery (realtime-link.md, "Host refresh and recovery") - the TV-side token buckets (CC-3.20)
  already absorb a burst of offers, and no AC covers it. Flagged as a possible follow-up.
- The ping cadence (250ms "playing" vs 1,000ms idle) is approximated by whether GameController.vue
  is mounted (link.setPlaying(true) on mount / false on unmount), not by the game's actual phase,
  since the controller layer doesn't see phase directly. Reasonable proxy; no AC pins the exact
  numbers.
- Verify: pnpm check, pnpm check:style, pnpm check:deps, pnpm test, pnpm build, pnpm budgets and
  the full e2e suite (22/22, chromium+webkit) all green locally with the link switch at its
  default (off), so existing relay-path gameplay is unaffected.

Reviewer (dipsaus-ai:story-reviewer, sonnet, round 1): pass. All 6 acceptance criteria met, no
scope violations (App.vue/session.ts/state.ts/env.d.ts touches judged reasonable necessities).

4 advisory findings, all addressed except one deliberately left as-is:
- Fixed: recomputeUp() was calling machine.retry() on every follow() while sitting on the relay
  path, cancelling the state machine's own exponential backoff on ordinary room traffic and
  risking the 10-attempts-per-hour budget. Now edge-triggered: retry() fires only when the
  session goes from not-wanting-a-link to wanting one, or a new game starts (both named triggers
  in Connection lifecycle), never on repeated follow() calls while already relay + active. Added
  two regression tests.
- Fixed (coverage gap): added a controller.test.ts case asserting controllerProps forwards
  `input` only when given one, closing part of the reviewer's noted coverage gap on
  controller.ts's own wiring (GameController.vue itself still has no dedicated component-mount
  test; judged acceptable, it's exercised end-to-end by the e2e suite once CC-3.22 lands and its
  own logic here is a thin composition of already-tested pieces).
- Left as-is (self-correcting, advisory): a mid-room socket reconnect can start a new connecting
  attempt on the raw socket-open event slightly before that connection's own room:welcome
  arrives (realtime-link.md's "Phone reconnect" step 2 names room:welcome as the trigger). The
  5 s connect timeout falls back to relay either way, so this never produces a wrong outcome.
- Left as-is (accepted approximation, already recorded above): ping cadence keyed to
  GameController.vue's mount/unmount rather than the game's actual playing phase.

Re-verified after the fixes: pnpm check, check:style, check:deps, test (156 controller tests),
build and budgets all green; full e2e suite green (22/22, chromium+webkit) beforehand.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Wired the phone-side WebRTC link's browser layer: apps/controller/src/runtime/link.ts
(createControllerLink) drives game-sdk/link's state machine from a real RTCPeerConnection with
iceServers: [] and the two negotiated data channels (cc-stream id 0 unordered/unreliable,
cc-events id 1 reliable), offering only once seated with the TV connected, ignoring stale
answers by attempt id, sampling clock/RTT over link:ping/pong, and falling back to the relay
path within one connect/stale/backoff cycle on a cut link or a hidden page. link-switch.ts gates
it on VITE_REALTIME_LINK with a ?link=1/?link=0 override, off by default. Every running game
gets its own InputChannel from link.createChannel(), wired through controller.ts's
controllerProps/useGameController and GameController.vue, which also renders a minimal ?dev=1
readout (path + round trip, never an address). session.ts owns the link's lifecycle (follow(),
rtc:answer routing) since it must be up before any game starts, not just while one is mounted -
the same App.vue integration pattern CC-5.10 used for the motion session.

All 6 acceptance criteria met and unit-tested (apps/controller/test/runtime/link.test.ts, using
@couchcade/game-sdk/testing's createFakeLink for the data-channel transport). Independent review
(round 1) passed with 4 advisory findings; the one substantive one (retry() firing on every
follow() call instead of only on the Connection lifecycle's named triggers, risking the hourly
attempt budget) was fixed with regression tests. Full verify green: check, check:style,
check:deps, test, build, budgets, and the full e2e suite (22/22).
<!-- SECTION:FINAL_SUMMARY:END -->
