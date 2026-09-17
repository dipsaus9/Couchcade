---
id: CC-3.13
title: 'Spike: measure the no-STUN direct link on an iPhone and a laptop'
status: To Do
assignee: []
created_date: '2026-09-17 17:49'
updated_date: '2026-09-17 17:49'
labels:
  - story
  - owner-playtest
dependencies:
  - CC-3.12
references:
  - spikes/realtime-link/
parent_task_id: CC-3
priority: high
type: spike
ordinal: 212000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A go or no-go decision, with measured numbers, on the direct WebRTC link with no STUN server between the owner's iPhone and laptop on the same Wi-Fi (docs/architecture/realtime-link.md, rollout step 1).

Type: spike
Justification: how often a no-STUN link connects, and how fast it is, can only be measured on the owner's own devices and Wi-Fi, not settled from the desk.
Branch: CC-3.13/no-stun-link-spike
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 spikes/realtime-link/ has a TV page and a phone page that open negotiated data channels with iceServers [] and signal through the local Vite dev server
- [ ] #2 The phone page's Copy results output includes: connected yes or no, time to connect, the selected candidate pair type (host or peer-reflexive), link round trip p50 and p90 at 30 and 60 messages per second over 60 s, loss per 100 messages, and compact and full description sizes in bytes
- [ ] #3 The task notes hold results for the iPhone on the same Wi-Fi, on 4G, with iCloud Private Relay on and in Low Power Mode, plus an Android phone on the same Wi-Fi when one is available
- [ ] #4 The final summary records the go or no-go decision, the measured no-STUN direct-connect rate and the rationale
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Build a throwaway Vite page with a dev-server middleware for offer and answer (local only). TV page at /tv, phone page at /phone. Negotiated channels as in docs/architecture/realtime-link.md. Collect getStats candidate pair type, pings over cc-stream, description sizes. Owner runs it through a cloudflared quick tunnel and pastes results.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Owner run: follow 'The spike, step by step for the owner' in docs/architecture/realtime-link.md (about 20 minutes, iPhone and laptop on the same Wi-Fi). Worker rule: stop after the page works locally, return to the orchestrator for the owner run, record results with --append-notes, leave In Progress for sign-off.
Verify: pnpm check, pnpm test, pnpm build; the page connects two local browser tabs.
<!-- SECTION:NOTES:END -->
