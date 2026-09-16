---
id: CC-2.1
title: Write the security design doc in docs/architecture/security.md
status: In Progress
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 15:46'
labels:
  - story
  - owner-gate
dependencies:
  - CC-1.1
references:
  - docs/architecture/security.md
parent_task_id: CC-2
type: docs
ordinal: 43000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
An approved threat model updated for the host passcode.

Type: deliverable
Branch: CC-2.1/security-design-doc
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The doc has a threat → defence → test table covering passcode brute force, room code guessing, direct WebSocket access, flooding, malformed messages, names, XSS and supply chain
- [x] #2 It records where Turnstile runs now that hosting needs a passcode
- [ ] #3 Owner approval is recorded in the task notes as "Approved by owner: <YYYY-MM-DD>" before the story is Done
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Read CC-2 epic + stories, platform.md, README security, TECH_STACK, CC-1.10.
2. Write docs/architecture/security.md: decisions first (owner reads ~15 min), assets and attackers, threat -> defence -> test table covering passcode brute force, room code guessing, direct WebSocket access, flooding, malformed messages, names, XSS, supply chain (+ deploy credentials), Turnstile placement, request check order per endpoint, rate limit and flood numbers tied to the free-tier budget, tokens, headers/CSP, names, supply chain, incident steps, story mapping, open decisions for the owner.
3. Self-review for consistency with platform.md (join flow, passcode, tickets, message catalogue, 4/s and 1.5/s caps, loose Rate Limiting binding) and HOUSE_STYLE voice.
4. Commit, review gate, merge origin/main, push under lock, draft PR. Leave In Progress (owner gate).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Owner gate: open the docs PR, send the owner a short summary plus the PR link in chat, and wait for explicit approval. Merge only after approval; record it with --append-notes.

Review gate (dipsaus-ai:story-reviewer, round 1): pass. AC1 and AC2 met; AC3 is the owner gate, pending. 5 advisories, all fixed in a follow-up commit: RL_PASSCODE source marked as amended (counts every attempt), missing passcode still reaches 401, rate-limit order rule reworded, malformed rejoin returns 401 to match platform.md, decision 3 names the 16-character option.
Open decisions for the owner (recommendations in the doc): 1 phone flood bucket 5/s burst 15 instead of 20/40; 2 join limit 20/min per IP instead of 10 for shared Wi-Fi; 3 drop the README's interactive challenge after 3 wrong codes; 4 cap rooms at 16 phones (8 players + 8 audience, 409 room-full).
Follow-ups: new CC-2 story for repo security setup (CodeQL default setup, Dependabot alerts, private vulnerability reporting, branch protection, pnpm audit in CI); amend CC-2.3, CC-2.5, CC-3.10, platform.md and README after the owner decides.
<!-- SECTION:NOTES:END -->
