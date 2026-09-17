---
id: CC-7.1
title: Write the audio design doc and pick CC0 sound sources
status: Done
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-17 16:20'
labels:
  - story
  - owner-gate
dependencies:
  - CC-1.1
references:
  - docs/architecture/audio.md
parent_task_id: CC-7
type: docs
ordinal: 87000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
An approved audio approach and a shortlist of CC0 sources.

Type: deliverable
Branch: CC-7.1/audio-design-doc
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 docs/architecture/audio.md covers engine, token-to-sound mapping, ducking, music loops and CC0 sources with licence links
- [x] #2 Owner approval is recorded in the task notes as "Approved by owner: <YYYY-MM-DD>" before the story is Done
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Read CC-7 epic and CC-7.2..7.6, platform/session-flow/motion docs, HOUSE_STYLE sound section, existing game sounds, cues and haptics.
2. Research engine options (Web Audio vs howler vs Phaser sound vs Tone.js) against the 450 KB host budget (pnpm budgets: 412.8 KB), autoplay rules, Ogg support in Safari, Vibration API support.
3. Research CC0 sources for the six platform tokens and a lobby loop, verify licences on source pages.
4. Write docs/architecture/audio.md: decisions first, open questions with recommendations, then binding detail for CC-7.2..7.6, conflicts table, sources.
5. Verify, independent review, push, draft PR; leave In Progress for owner approval.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Owner gate: open the docs PR, send the owner a short summary plus the PR link in chat, and wait for explicit approval. Merge only after approval; record it with --append-notes.

Review (dipsaus-ai:story-reviewer, round 1): pass. AC1 met; AC2 pending owner. Advisories: (a) owner gate stays open; (b) the Conflicts table amendments to CC-7.2..7.6 and the new Quick Draw and Target Range sound wiring stories must be applied with backlog-plan amend mode after approval; (c) setTargetAtTime wording fixed to a linear 50 ms ramp.
CC0 shortlist: every licence read on its source page 2026-09-17 (Freesound links to publicdomain/zero/1.0, Kenney pages say Creative Commons CC0, OpenGameArt License(s): CC0). Lobby loop primary Holizna 'Adventure Begins Loop' measured 130 BPM; backup congusbongus 'Welcome to the Item Shop' 115 BPM. Engine evidence: host platform JS 413.1/450 KB (pnpm budgets); howler 2.2.4 7.9 KB gzip core, last release 2023-09-19; Tone.js 15.1.22 79 KB gzip.

Approved by owner: 2026-09-17
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Shipped docs/architecture/audio.md, approved by the owner on 2026-09-17. It chooses plain Web Audio in @couchcade/audio (about 3 KB; howler.js and Tone.js rejected on bundle size and maintenance), keeps Phaser silent, and has games play house style tokens or sound refs declared in src/host/sounds.ts, each with a required visual. It specifies music and effects buses under a master, 50% ducking under callouts and stingers, one music loop at a time with an 800 ms crossfade, a phase-to-music table, unlocking audio on the passcode submit with a Click for sound chip after a TV refresh, and OGG Vorbis only with a 500 KB platform audio budget. Settings are mute, music and effects volume in localStorage (laptop only). Phone haptics use @couchcade/ui/haptics and do nothing on iPhone. It includes cue-to-sound tables for Quick Draw and Target Range and a CC0 shortlist with licence links: a primary and a backup for all six tokens, and the lobby loop Holizna Adventure Begins Loop at 130 BPM. Owner decisions: lobby music on at 60/80, volume on the laptop only, no sound on Safari older than 18.4, a Click for sound chip. Story amendments from the conflicts table are left to the orchestrator.
<!-- SECTION:FINAL_SUMMARY:END -->
