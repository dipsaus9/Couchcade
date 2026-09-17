---
id: CC-3.19
title: Connect phones to the host over the WebRTC link in the controller runtime
status: To Do
assignee: []
created_date: '2026-09-17 17:50'
updated_date: '2026-09-17 17:50'
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
- [ ] #1 A seated phone with the link switch on sends rtc:offer after room:welcome while the TV is connected, using iceServers [] and negotiated channels cc-stream (id 0, ordered false, maxRetransmits 0) and cc-events (id 1, reliable)
- [ ] #2 Audience phones and browsers without RTCPeerConnection never send rtc:offer
- [ ] #3 The link switch is off unless VITE_REALTIME_LINK is on, and ?link=1 or ?link=0 overrides it for one page load
- [ ] #4 Game controllers receive input, and a component test with createFakeLink shows sends move to the relay path within 1 s after the link is cut
- [ ] #5 The phone closes its link when the page is hidden and offers again with a new attempt id once it is visible and room:welcome arrived
- [ ] #6 With ?dev=1 the phone shows its path and link round trip and never an address
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check, pnpm test, pnpm build.
<!-- SECTION:NOTES:END -->
