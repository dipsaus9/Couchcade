---
id: CC-9.5
title: Write the game night guide for the owner
status: Done
assignee: []
created_date: '2026-09-16 12:25'
updated_date: '2026-09-21 04:25'
labels:
  - story
dependencies:
  - CC-1.18
  - CC-3.8
  - CC-5.10
references:
  - docs/GAME_NIGHT.md
parent_task_id: CC-9
type: docs
ordinal: 103000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A one-page guide to running a game night.

Type: deliverable
Branch: CC-9.5/game-night-guide
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 docs/GAME_NIGHT.md covers: opening the host on laptop or Chromecast, passcode, calibration, joining by QR, motion permission, what to do when the daily free limit is hit
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Read README, docs/architecture/platform.md, docs/architecture/session-flow.md, passcode screen, calibration screen, QrCode.vue, controller motion flow, controller copy.ts (voice), and CC-9.4 status for the free-tier limit UX. Write docs/GAME_NIGHT.md: one page, owner-facing, referee voice, covering (1) opening host on laptop or casting via Chromecast, (2) passcode, (3) TV-lag calibration, (4) joining by QR, (5) motion permission, (6) daily free-limit behavior + note on CC-9.4. Single commit, verify, review (haiku, docs-only), push, draft PR.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
docs/GAME_NIGHT.md written from the shipped code: README (host URL, Chromecast = casting the browser tab, not a receiver app), apps/host/src/screens/passcode/PasscodeScreen.vue + docs/architecture/security.md (Host passcode section, rotation via wrangler secret put), apps/host/src/screens/calibration/CalibrationScreen.vue + LobbyScreen.vue's Check TV lag button + packages/game-sdk/src/clock/display-lag.ts (localStorage, once per laptop/TV pairing), apps/host/src/screens/lobby/QrCode.vue + JoinPanel.vue + join-url.ts, apps/controller/src/motion/copy.ts (motionCopy) for the permission/calibration/fallback copy, and docs/architecture/platform.md free-tier budget rules + apps/host/src/session/use-host-session.ts createErrorCopy + apps/controller/src/join/copy.ts joinFailureCopy for today's actual (generic, not quota-specific) error messages -- confirmed CC-9.4 is still To Do (apps/host/src/errors and apps/controller/src/errors don't exist yet), so the guide describes the real current fallback copy and notes CC-9.4 will add a dedicated quota screen.

Reviewer (dipsaus-ai:story-reviewer, model sonnet, round 1): verdict pass. AC1 met -- all six required topics confirmed present and cross-checked accurate against source (PasscodeScreen.vue, security.md, CalibrationScreen.vue, LobbyScreen.vue, display-lag.ts, QrCode.vue/JoinPanel.vue/join-url.ts, apps/controller/src/motion/copy.ts, use-host-session.ts, apps/controller/src/join/copy.ts, platform.md budget rules). No scope violations. 2 advisory findings: (1) 'don't switch tabs while casting' claim -- kept, it's supported by docs/architecture/realtime-link.md ('a cast tab is often in the background, where Chrome slows timers'); (2) tap-ms readout said 'in the lobby' but is actually on the separate calibration screen -- fixed in a follow-up commit.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Wrote docs/GAME_NIGHT.md, a one-page owner-facing guide to running a Couchcade game night in the house referee voice. Covers opening the host on a laptop or by casting the Chrome tab to a Chromecast (no dedicated Chromecast app), how the host passcode works and rotates, the once-per-laptop/TV Check TV lag calibration, joining by QR or typed room code, the phone-side motion permission flow with touch fallback, and what actually happens today when the Cloudflare Workers free-tier daily request budget is hit (the generic 'Couldn't open a room' / 'The room didn't answer' retry copy, since CC-9.4's dedicated quota-reached screen hasn't shipped yet). Content was sourced directly from the shipped code and architecture docs, independently reviewed (pass, round 1) against the acceptance criteria and fact-checked line by line.
<!-- SECTION:FINAL_SUMMARY:END -->
