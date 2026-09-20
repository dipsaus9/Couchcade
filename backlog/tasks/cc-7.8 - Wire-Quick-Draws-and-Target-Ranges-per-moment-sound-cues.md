---
id: CC-7.8
title: Wire Quick Draw's and Target Range's per-moment sound cues
status: To Do
assignee: []
created_date: '2026-09-19 08:23'
updated_date: '2026-09-20 10:22'
labels:
  - story
dependencies: []
references:
  - games/target-range/src/host/
  - games/quick-draw/src/host/
  - apps/host/src/audio/
parent_task_id: CC-7
type: feature
ordinal: 228000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Outcome: the sound cue points both games already emit (draw, shoot, land/hit, tick, reveal, etc.) actually play a sound through @couchcade/audio, not just music and general UI clicks.

Type: deliverable
Branch: CC-7.8/wire-game-sound-cues

games/target-range/src/host/cues.ts and games/quick-draw's equivalent already define every cue and say in their own comments that nothing subscribes yet. Confirmed still true during the CC-3.24 owner replay (2026-09-19): 'no hit sound, only near a bullseye' — that's the general callout pop-in, not a real per-shot sound. This was already a known pending follow-up (docs/architecture/audio.md conflicts list); this story is it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A playtest note confirms sounds are heard for draws, shots/taps, hits/misses and round transitions, not only music and UI clicks
- [ ] #2 Every cue in games/target-range/src/host/cues.ts and its Quick Draw equivalent plays the matching @couchcade/audio token when it fires, except Quick Draw's still-missing background music loop (no verified-clean CC0 loop asset exists yet; tracked separately by a follow-up story)
<!-- AC:END -->
