---
id: CC-7.9
title: Source and verify a clean Quick Draw background music loop
status: To Do
assignee: []
created_date: '2026-09-20 10:22'
labels:
  - needs-info
dependencies: []
references:
  - games/quick-draw/src/host/sounds.ts
  - games/quick-draw/assets/sounds/
  - games/quick-draw/CREDITS.md
parent_task_id: CC-7
type: chore
ordinal: 235000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Outcome: Quick Draw plays a background music loop during its round/result cues, matching Target Range's already-shipped music (games/target-range's loop landed in an earlier story).

Type: deliverable
Branch: CC-7.9/quick-draw-music-loop

CC-7.8 wired every other Quick Draw sound cue but deliberately left this out: the raw Chiploop source (OpenGameArt, CC0) is already in the repo's tooling reach, but no one in the delivery pipeline can judge whether a trimmed cut sounds seamless -- aubio's automated beat-tracking on this file gave an inconsistent, not-confidently-bar-aligned cut point (unlike Target Range's earlier confirmed 3-repeat loop). This needs either an owner ears-on check of a candidate trim, or a different CC0 loop that's easier to cut cleanly.

games/quick-draw/src/host/sounds.ts already has two audio.music(...) call sites commented as TODOs for this -- wire them up once a verified asset exists.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A background music loop plays during Quick Draw's round and result cues, verified by ear (owner or a session capable of audio playback) to loop cleanly with no audible seam
- [ ] #2 The asset is added under games/quick-draw/assets/sounds/ with a CREDITS.md entry matching the project's existing CC0 attribution pattern
<!-- AC:END -->
