---
id: CC-1.1
title: Write the platform architecture doc in docs/architecture/platform.md
status: Done
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 15:32'
labels:
  - story
  - owner-gate
dependencies:
  - CC-1.3
references:
  - docs/architecture/platform.md
parent_task_id: CC-1
priority: high
type: docs
ordinal: 24000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A reviewed architecture doc that every platform and game story builds on: package map, relay design, protocol, join flow, game contract, clock sync, dev/deploy topology and repo conventions.

Type: deliverable
Branch: CC-1.1/platform-architecture-doc
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 docs/architecture/platform.md has sections: package map and dependency direction, relay (partyserver, hibernation rules), protocol envelope and full platform message catalogue, room lifecycle and join flow (QR, room code, host passcode, tickets), game contract and auto-discovery registry, clock sync, local dev and deploy topology, free-tier budget rules, repo conventions
- [x] #2 The doc contains a Mermaid diagram of host/relay/phone traffic and a Mermaid diagram of package dependencies
- [x] #3 The conventions section covers: root scripts defined once in the scaffold, wildcard subpath exports per package, lockfile conflicts resolved by rebase + pnpm install, per-game CREDITS.md and scene palette files
- [x] #4 The dev topology section records the decision from CC-1.3
- [x] #5 Owner approval is recorded in the task notes as "Approved by owner: <YYYY-MM-DD>" before the story is Done
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Read README, TECH_STACK, HOUSE_STYLE, CC-1.3 decision + gotchas, every CC-1.x story, CC-2..CC-9 and CC-10 ACs, partyserver 0.5.10 / partysocket 1.3 typings.
2. Write docs/architecture/platform.md: decisions at a glance and open decisions first (owner can approve in 15 minutes), then detail sections for package map + dependency direction, relay + hibernation rules, protocol envelope + full catalogue, room lifecycle + join flow, game contract + registry, clock sync, dev + deploy topology (CC-1.3 decision), free-tier budget (conservative 1 message = 1 request, per-phone rate TBC by CC-1.4 on one line), repo conventions.
3. Mermaid: traffic diagram, package dependency diagram, plus join sequence and room state diagram.
4. Verify: mermaid blocks parse (mermaid CLI if available), relative links and anchors resolve, every AC1 section present.
5. Review gate, draft PR, leave In Progress for owner approval.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Owner gate: open the docs PR, send the owner a short summary plus the PR link in chat, and wait for explicit approval. Merge only after approval; record it with --append-notes.
Inputs: README.md, docs/TECH_STACK.md, docs/HOUSE_STYLE.md, planning decisions of 2026-09-16 (host passcode, QR join, English only, lean tests, CC0 assets, build with partyserver/partysocket/nipplejs).

Verify: 7 Mermaid diagrams render with @mermaid-js/mermaid-cli 11 (0 failures); 27 relative links and anchors resolve (0 broken). Budget section uses the conservative 1 incoming message = 1 DO request assumption; the per-phone cap R = 15 msg/s is one line marked 'to be confirmed by CC-1.4'. Open decisions for the owner: clock reference (recommend room clock), late joins during a game (recommend seat + next game), deploy freeze switch (recommend DEPLOY_FREEZE repo variable).

Review gate (dipsaus-ai:story-reviewer, round 1): pass. AC1-AC4 met, AC5 pending owner approval (owner gate), no scope violations. Advisory: the doc splits the middle tier into core (game-sdk, physics, audio) and kit (stage, ui, motion, may import core); CC-1.19 AC1 still states one flat band and should be aligned when CC-1.19 is picked up.

Owner decisions (2026-09-16), relayed by the orchestrator: (1) Clock: option A, the Room Durable Object answers clock pings and all devices sync to the room clock. (2) Mid-game joiners: option A, seat and colour right away, playing from the next game. (3) Deploys: option B, every merge to main deploys right away, no DEPLOY_FREEZE variable; the owner accepts that a deploy can drop a round in progress. platform.md updated: open decisions section removed, decisions table rows 15-17 added, DEPLOY_FREEZE removed. Doc approval itself is still pending.

Approved by owner: 2026-09-16

Budget section updated with CC-1.4 results as agreed at approval: 1 request per connect, incoming message (phone and host) and close; 20:1 unconfirmed so 1:1 stays; phone cap 4 msg/s (>= 250 ms apart); host controller:state cap 1.5 msg/s (>= 667 ms apart, on change, coalesced): 80,000 - 8 x 7,200 s x 0.3 x 4 = 10,880 left, / 7,200 s = 1.51, so 1.5/s = 10,800; together 79,920 <= 80,000 with a 20,000 reserve covering about 13,000 of turn-based input, keep-alive, clock and room traffic. Rate Limiting binding works on Free but loosely (151 of 271 allowed against 10/60 s), abuse control only.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Shipped docs/architecture/platform.md, approved by the owner on 2026-09-16: decisions table (including the owner's choices of room clock, mid-game joiners seated for the next game, and deploy on every merge), package tiers and import rules, relay routing and hibernation rules, JSON envelope and full message catalogue with close codes and HTTP API, room lifecycle and join/ticket/rejoin flow, game contract with registry and test kit, clock sync, dev and deploy topology recording the CC-1.3 decision, free-tier budget rules updated with CC-1.4 measurements (1:1 counting, phone cap 4/s, host cap 1.5/s, loose rate limiting on Free), and repo conventions. 7 Mermaid diagrams render; all links resolve. Epic CC-1 stays open.
<!-- SECTION:FINAL_SUMMARY:END -->
