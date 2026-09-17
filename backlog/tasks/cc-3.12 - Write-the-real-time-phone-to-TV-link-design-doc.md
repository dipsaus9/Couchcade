---
id: CC-3.12
title: Write the real-time phone-to-TV link design doc
status: In Progress
assignee: []
created_date: '2026-09-17 17:23'
updated_date: '2026-09-17 17:36'
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
- [ ] #2 Owner approval is recorded in the task notes as "Approved by owner: <YYYY-MM-DD>" before the story is Done
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
<!-- SECTION:NOTES:END -->
