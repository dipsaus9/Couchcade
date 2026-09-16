---
id: CC-1.2
title: 'Update README, TECH_STACK and HOUSE_STYLE with the planning decisions'
status: Done
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 15:00'
labels:
  - story
dependencies: []
references:
  - README.md
  - docs/TECH_STACK.md
  - docs/HOUSE_STYLE.md
parent_task_id: CC-1
priority: high
type: docs
ordinal: 25000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The project docs match the decisions made during planning, so agents never build against outdated rules.

Type: deliverable
Branch: CC-1.2/record-planning-decisions
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 README testing section states the lean bar: unit tests for game and platform logic plus one bot-plays-a-match E2E per game; per-package coverage thresholds are removed
- [x] #2 README and HOUSE_STYLE allow CC0 assets recoloured to the palettes with a credits entry, and still forbid assets, names or characters from existing games
- [x] #3 README games table lists all 14 planned games with their inspiration and approved names
- [x] #4 README join flow describes the QR code, the 4-letter fallback and the host passcode
- [x] #5 README roadmap lists the epics CC-1 to CC-23 instead of the old phases
- [x] #6 TECH_STACK lists partyserver, partysocket, nipplejs and Planck.js as chosen libraries
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. README: setting (players, phones, big screen, English), join flow (QR + 4-letter code, host passcode, open joining), 14-game table from epics CC-10..CC-23, tech stack rows for partyserver/partysocket/nipplejs/Planck.js, lean testing section without coverage thresholds (also scripts, CI, contributing, creating a game), CC0 asset rule, roadmap = epics CC-1..CC-23, Phase 0 mentions replaced by CC-1 spikes, HOST_PASSCODE in secrets.
2. TECH_STACK: setting constraints, decisions + libraries table (versions/licences from npm), rejected platform alternatives from CC-1, open questions mapped to CC-1.3/CC-1.4, drop visual baselines.
3. HOUSE_STYLE: assets and credits section (CC0 recoloured + per-game CREDITS.md, nothing from existing games), QR code next to room code, English-only voice, enforcement/checklist updated.
4. Verify: every relative markdown link and anchor resolves.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: markdown links resolve (grep for broken relative links).

Review gate (dipsaus-ai:story-reviewer, round 1): pass. All 6 criteria met, no scope violations, no findings. Verify: 46 relative markdown links and anchors in README.md, docs/TECH_STACK.md and docs/HOUSE_STYLE.md resolve (0 broken).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Recorded the 2026-09-16 planning decisions in the project docs. README: target setup (2-4 players, mixed iPhone/Android, laptop over HDMI or Chromecast, English only), join flow with host passcode, QR code and 4-letter code fallback, the 14 planned games from epics CC-10 to CC-23, partyserver/partysocket/nipplejs/Planck.js in the stack, a lean testing section (unit tests + one bot-plays-a-match E2E per game, no coverage thresholds), CC0-with-credits asset rule, HOST_PASSCODE secret, and a roadmap of epics CC-1 to CC-23 replacing the phases. TECH_STACK: setting constraints, decisions rows, a Libraries section with versions and licences, rejected platform alternatives, open questions mapped to CC-1.3/CC-1.4. HOUSE_STYLE: an Assets and credits section, QR code on the room code panel, English-only voice, updated enforcement list and review checklist. All 46 relative links resolve.
<!-- SECTION:FINAL_SUMMARY:END -->
