---
id: CC-3.13
title: 'Spike: measure the no-STUN direct link on an iPhone and a laptop'
status: In Progress
assignee: []
created_date: '2026-09-17 17:49'
updated_date: '2026-09-17 20:26'
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
- [x] #1 spikes/realtime-link/ has a TV page and a phone page that open negotiated data channels with iceServers [] and signal through the local Vite dev server
- [x] #2 The phone page's Copy results output includes: connected yes or no, time to connect, the selected candidate pair type (host or peer-reflexive), link round trip p50 and p90 at 30 and 60 messages per second over 60 s, loss per 100 messages, and compact and full description sizes in bytes
- [ ] #3 The task notes hold results for the iPhone on the same Wi-Fi, on 4G, with iCloud Private Relay on and in Low Power Mode, plus an Android phone on the same Wi-Fi when one is available
- [ ] #4 The final summary records the go or no-go decision, the measured no-STUN direct-connect rate and the rationale
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Standalone throwaway spike (own pnpm-workspace.yaml + lockfile, like CC-1.3/CC-1.4). vite.config.ts serves /tv and /phone (no .html) and hosts a tiny in-memory offer/answer mailbox at /api/offer and /api/answer (long-poll, per-attempt). Both pages open negotiated cc-stream (unordered, maxRetransmits 0) and cc-events (reliable) channels with iceServers: []. Phone page: requests iOS motion permission on Start, negotiates over the mailbox with a 5s connect deadline, runs 30s at 30/s then 30s at 60/s treating every stream sample as its own ping (host echoes a pong immediately), computes RTT p50/p90 and loss/100 per phase from its own clock, reads getStats() for the selected candidate pair type, measures full SDP size and a doc-shaped compact-description size (parsed from the SDP, size-only -- CC-3.16 owns the real codec), and renders a copyable text summary. TV page: answers, shows connection state and a dot driven by the phone's samples. README.md gives the owner exact non-developer steps mirroring the doc's step-by-step, including the cloudflared quick tunnel and the Wi-Fi/4G/Private-Relay/Low-Power-Mode matrix. AC1-2 are met by building and self-verifying the harness (two local browser tabs); AC3-4 need the owner's own run and stay unchecked with a note. Also: edit CC-3.15 and CC-3.16 deps from CC-3.14 to CC-3.12 via the backlog CLI, re-passing all existing --ref/--dep, with a note on why in each.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Owner run: follow 'The spike, step by step for the owner' in docs/architecture/realtime-link.md (about 20 minutes, iPhone and laptop on the same Wi-Fi). Worker rule: stop after the page works locally, return to the orchestrator for the owner run, record results with --append-notes, leave In Progress for sign-off.
Verify: pnpm check, pnpm test, pnpm build; the page connects two local browser tabs.

Built spikes/realtime-link/ (standalone workspace, own lockfile, like CC-1.3/CC-1.4): vite.config.ts serves /tv and /phone and hosts a tiny in-memory offer/answer mailbox; both pages open negotiated cc-stream (unordered, maxRetransmits 0) and cc-events (reliable) channels with iceServers: []. Verified locally with two headless-Chrome tabs (browser-test.mjs): SDP negotiation, ICE, data channels and the pos/pong round trip all work end to end; one full run produced a real (non-owner) sample summary: Connected: yes, Time to connect: 802ms, Offer full=566B compact=153B, Answer full=564B compact=152B, Candidate pair local=host remote=host, RTT @30/s p50=1ms p90=1ms sent=51 lost=0, RTT @60/s p50=1ms p90=1ms sent=120 lost=0 (same-machine loopback, so these numbers are not the owner's Wi-Fi result -- they only prove the harness works). AC1 and AC2 are met by the harness itself and are checked off. AC3 (iPhone results across Wi-Fi/4G/Private Relay/Low Power Mode, plus Android if available) and AC4 (go/no-go decision) need the owner's own ~20-minute run per README.md's steps and docs/architecture/realtime-link.md's 'The spike, step by step for the owner' -- left unchecked, and the story stays In Progress (not Done) until the owner runs it and the decision is signed off. One environment note found while verifying: on this dev machine, two headless-Chrome tabs on the same laptop failed to connect via mDNS host candidates (ICE stuck at 'new') until mDNS was disabled for the test browser -- looks like a macOS Local Network permission / multicast quirk specific to a fresh headless profile, not a harness bug (SDP negotiation completed correctly: ufrag/pwd/fingerprint present, iceGatheringState reached complete, signalingState stable). Documented as a same-machine testing snag in the README; flagged in case the owner's laptop browser ever needs the same macOS Local Network permission granted for a real run.
<!-- SECTION:NOTES:END -->
