---
id: CC-3.1
title: Write the session flow and SDK extensions design doc
status: Done
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 16:19'
labels:
  - story
  - owner-gate
dependencies:
  - CC-1.1
references:
  - docs/architecture/session-flow.md
parent_task_id: CC-3
type: docs
ordinal: 50000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
An approved design for menu, results, reconnect, recovery, input batching, lag compensation, calibration, physics, audience and the game template.

Type: deliverable
Branch: CC-3.1/session-flow-doc
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 docs/architecture/session-flow.md covers each topic in the outcome with sequence diagrams for reconnect and host-refresh recovery
- [x] #2 Input batching rates use the CC-1.4 measurement when available, else 15 msg/s
- [x] #3 Owner approval is recorded in the task notes as "Approved by owner: <YYYY-MM-DD>" before the story is Done
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Write docs/architecture/session-flow.md: decisions table and owner forks first, then binding sections per CC-3.x story (phases, menu, results, audience, phone reconnect and host recovery with sequence diagrams, input batching at the CC-1.4 rate of 4/s, rewind, calibration, physics, create-game template), party mode hooks, budget check, platform.md conflicts found. Reference platform.md and security.md instead of repeating them. Verify with pnpm check/test/build, independent review, draft PR, leave In Progress for owner approval.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Owner gate: open the docs PR, send the owner a short summary plus the PR link in chat, and wait for explicit approval. Merge only after approval; record it with --append-notes.

Review gate (dipsaus-ai:story-reviewer, round 1): pass. AC1 and AC2 met, no scope violations, no findings. AC3 is the owner gate and stays open until the owner approves the PR.

Owner decisions 2026-09-16 recorded in session-flow.md: (1) TV lag check taps along to a steady flashing beat, measuring display lag without reaction time; network lag is handled by room-clock timestamps. (2) VIP pick starts a 3-second countdown the VIP can change or cancel. (3) Every turn-based game spec sets a turn timer, no platform pause. Still open: decision 4, a controller-only entry for phones so Planck.js never reaches the phone bundle. The doc is not approved yet.

Owner decision 4 (2026-09-16): phones load a controller-only entry per game (games/*/src/controller/index.ts), so physics never ships to phones. Recorded in session-flow.md. platform.md, README and CC-3.8 follow-ups are handled by the orchestrator.
Approved by owner: 2026-09-16
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added docs/architecture/session-flow.md, the approved design for everything around a game: phases and per-device screens, the VIP game menu with a 3-second changeable countdown, results, audience promotion between games, phone reconnect and host-refresh recovery (both with sequence diagrams, snapshot timing and a 600-byte game snapshot budget), the input stream at the CC-1.4-measured 4 inputs per second, the pure withRewind wrapper (200 ms history, 150 ms cap), TV lag calibration by tapping along to a steady beat (display lag only, network lag handled by room-clock timestamps), the pure rebuild-every-step physics package, the create-game template, party mode hooks and a budget check. Owner decisions of 2026-09-16: tap-along calibration, pick countdown, turn timers in turn-based games, and a controller-only phone entry per game so Planck.js never reaches phones. Approved by the owner on 2026-09-16.
<!-- SECTION:FINAL_SUMMARY:END -->
