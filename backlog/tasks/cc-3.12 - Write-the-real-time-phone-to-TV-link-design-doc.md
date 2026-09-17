---
id: CC-3.12
title: Write the real-time phone-to-TV link design doc
status: Done
assignee: []
created_date: '2026-09-17 17:23'
updated_date: '2026-09-17 20:02'
labels:
  - story
  - owner-gate
dependencies:
  - CC-3.1
references:
  - docs/architecture/realtime-link.md
parent_task_id: CC-3
priority: high
type: docs
ordinal: 211000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
An owner-approved design in docs/architecture/realtime-link.md for a direct WebRTC DataChannel between each phone and the host, with the room Durable Object only signalling, answering the Target Range playtest of 2026-09-17 (laggy input, crosshair often off, aim speed). It covers goals and non-goals, topology and authority, the signalling schema and its request cost, channel settings and rates, budget and flood rule changes, security and privacy, browser support, connection lifecycle, clock and latency measurement, fallback detection and TV-side smoothing, phone-decided shots, the game SDK API sketch, testing, rollout, risks, the aim gain tuning for Target Range, a found-while-writing table and proposed implementation stories including a real-device latency spike.

Type: deliverable
Branch: CC-3.12/realtime-link-doc
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 docs/architecture/realtime-link.md covers every topic in the outcome, links its online sources, and passes the story-reviewer gate
- [x] #2 Owner approval is recorded in the task notes as "Approved by owner: <YYYY-MM-DD>" before the story is Done
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Research WebRTC DataChannels, mDNS host candidates, free STUN and TURN, browser support and Cloudflare billing online. Read platform.md, session-flow.md, security.md, motion.md, target-range.md and the input, clock and aim code. Write docs/architecture/realtime-link.md in the house doc style: owner summary and decisions table first, open questions with recommendations, then binding sections. Keep approved docs unchanged and list their amendments as proposed follow-ups. Verify with pnpm check, test and build, run the reviewer (haiku, docs-only), open a draft PR and leave In Progress for owner approval.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Owner gate: open the docs PR, send the owner a short summary plus the PR link, and wait for explicit approval. Record it with --append-notes.
Owner playtest feedback (2026-09-17), Target Range: input too laggy, more events wanted, crosshair often off, crosshair speed feels too fast or too slow. Owner decisions (2026-09-17): direct phone-to-host WebRTC link with DO signalling only and no paid TURN; fallback to the relay path at 4/s with TV-side smoothing; the phone decides its own shot; generic SDK capability for all games; tune the default aim gain, no per-player setting.
Verify: pnpm check, pnpm test, pnpm build; the doc renders its mermaid blocks on GitHub.

Review gate (dipsaus-ai:story-reviewer, haiku, round 1): pass. AC1 met, no scope violations, no findings. AC2 is the owner gate and stays open until the owner approves the PR.

Owner answers 2026-09-17, recorded in the doc under "Owner answers (2026-09-17)": (1) no STUN server at all (iceServers: []) and no TURN, so the link only uses local candidates and nothing about it leaves the house; adding STUN or TURN later needs a new owner decision. (2) The link carries input only; phone screens stay on the relay and screens-over-link is a noted follow-up idea. (3) Target Range aims at 6 world px per degree both ways, touch pad 1.5 world px per CSS px both ways, aim sent with 3 decimals. (4) Rollout as recommended: behind a switch until the spike, the E2E tests and the owner replay, then on by default with ?link=0 as the escape hatch; streams at 30 per second, 60 when a game asks.
Approved by owner: 2026-09-17
Implementation stories created 2026-09-17: CC-3.13 (spike), CC-3.14 (doc amendments), CC-3.15 (signalling through the room), CC-3.16 (link core), CC-3.17 (stream playback), CC-3.18 (InputChannel), CC-3.19 (controller link runtime), CC-3.20 (host links), CC-3.21 (aim sender), CC-11.9 (Target Range aim), CC-3.22 (E2E), CC-3.23 (link clock samples), CC-3.24 (owner replay and switch-on). CC-5.7 amended to depend on CC-3.18 and use input.stream. Collision check: every reported overlap is between stories that already carry a dependency edge (CC-3.17 before CC-3.18, CC-3.19 before CC-3.23 and CC-3.24, CC-3.20 before CC-3.24, CC-11.7 before CC-3.24).

Review gate (dipsaus-ai:story-reviewer, haiku, round 2, after the owner answers and the story creation): pass. Both criteria met, no scope violations. One advisory: the doc status line writes the date as "17 September 2026" instead of ISO; kept, because every other doc in docs/architecture uses that form.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added docs/architecture/realtime-link.md, the approved design for a direct phone-to-TV link. Each seated phone opens a WebRTC data channel straight to the host laptop with no STUN and no TURN server, and the room Durable Object only forwards one compact rtc:offer and one rtc:answer (2 requests per connection, both under the 1 KB frame cap). Streams such as aim go 30 times a second (60 on request) over an unordered, no-retransmit channel and events over a reliable one, all free of Durable Object requests, while the relay caps stay as they are because a night where every link fails must still fit. A phone that can't connect falls back to today's path within a second, where the TV now interpolates, briefly predicts and catches up smoothly instead of holding a quarter-second-old crosshair, and a shot carries the aim the TV was shown so the arrow lands where the player aimed. The doc covers authority, the signalling schema and its cost, channel settings and rates, budget and flood changes with proposed platform.md text, security and privacy, browser support, the full connection lifecycle, clock and latency measurement, the fallback and smoothing algorithm, the game SDK InputChannel sketch, testing with a fake link and two browser contexts, rollout behind a switch, risks, how to tune Target Range's aim speed to 6 px per degree in both directions, 17 findings and the 13 implementation stories CC-3.13 to CC-3.24 and CC-11.9. Approved by the owner on 2026-09-17, who chose no STUN instead of the recommended Cloudflare STUN and kept phone screens on the relay.
<!-- SECTION:FINAL_SUMMARY:END -->
