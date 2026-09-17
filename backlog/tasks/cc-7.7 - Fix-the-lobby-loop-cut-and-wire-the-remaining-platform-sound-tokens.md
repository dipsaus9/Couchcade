---
id: CC-7.7
title: Fix the lobby loop cut and wire the remaining platform sound tokens
status: To Do
assignee: []
created_date: '2026-09-17 21:57'
updated_date: '2026-09-17 21:59'
labels:
  - story
dependencies:
  - CC-7.4
references:
  - apps/host/public/audio/lobby-loop.ogg
  - apps/host/CREDITS.md
  - docs/CREDITS.md
  - apps/host/src/audio/
  - apps/host/src/screens/menu/MenuScreen.vue
  - apps/host/src/session/use-host-session.ts
  - apps/host/src/App.vue
  - apps/host/test/audio/
  - apps/host/test/menu/
  - apps/host/test/session/
parent_task_id: CC-7
priority: medium
ordinal: 225000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Recuts apps/host/public/audio/lobby-loop.ogg from the original CC0 source ("Adventure Begins Loop", Happy Chiptunes Collection, Holizna, https://opengameart.org/content/happy-chiptunes-collection) at the track's real tempo instead of docs/architecture/audio.md's stale 130 BPM figure: the current cut is 48 beats at 130 BPM (22.1547 s), but the track is really about 98.7 BPM, so the loop wraps from full-level audio into a roughly 20 ms near-silent gap at the seam -- a likely audible stutter. Also wires the rest of docs/architecture/audio.md's platform token table that CC-7.4 left unwired: press on laptop button clicks, the menu countdown ticks and the VIP card pick; scene on every phase change; ui when a player joins the lobby.

Type: deliverable
Branch: CC-7.7/lobby-loop-tokens
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 apps/host/public/audio/lobby-loop.ogg is recut from the original, uncut CC0 source at its measured real tempo (not 130 BPM), 8 or 9 bars (about 19.5 to 21.9 s)
- [ ] #2 The recut loop's seam is verified programmatically: sample continuity and level at the join, plus a beat-grid check, with the method and result recorded in the task notes
- [ ] #3 apps/host/CREDITS.md's lobby loop entry and notes state the corrected measured tempo and cut length, and docs/CREDITS.md is regenerated
- [ ] #4 The press token plays on every CcButton press on a TV (host) screen
- [ ] #5 The press token plays on each menu countdown tick and on the VIP's card pick in MenuScreen.vue
- [ ] #6 The scene token plays on every host phase change
- [ ] #7 The ui token plays when a player joins the lobby
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1) Recut the lobby loop: re-download the original, uncut 'Adventure Begins Loop' (59 s, made to loop) from the Happy Chiptunes Collection zip on OpenGameArt (same source CC-7.3 used); measure its real tempo with a beat-grid method more robust than a single aubio tempo call (e.g. aubioonset across the whole file, then fit the median inter-onset interval), not the doc's unverified 130 BPM; cut from the track's own top (0 s, matching CC-7.3's method) to the nearest whole-bar length in the 8-9 bar / 19.5-21.9 s range; fade/level/encode to OGG Vorbis with ffmpeg the same way CC-7.3 did (peak around -3 dBFS, short fade if needed), keep it under the 350 KB lobby-loop budget. 2) Verify the seam programmatically: compare the decoded first and last few ms of the buffer for level/continuity (ffmpeg PCM extraction + a small check script or ffmpeg astats), and confirm the cut length lands on a whole number of beats at the measured tempo; record the method and numbers in --append-notes. 3) Update apps/host/CREDITS.md's lobby loop row/notes with the corrected tempo and cut math (replacing the old 130 BPM / 12 bar / 22.1 s claim), then run the tooling/assets credits generator so docs/CREDITS.md stays consistent (don't hand-edit it). 4) Wire press: a host-only click listener (new file under apps/host/src/audio/, mirroring unlock.ts/click-for-sound.ts's pattern) that plays 'press' when a .cc-button element is clicked on a TV screen, started from App.vue alongside the other audio watchers, without touching @couchcade/ui (shared with the silent phone); wire press on MenuScreen.vue's countdown tick and its VIP-card-pick watch (alongside the existing 'ui' call there for the focus ring -- both tokens can fire for the same pick, per audio.md's own table). 5) Wire scene: NOT via apps/host/src/runtime/host-runtime.ts (References dropped it after the CC-3.20 collision check -- that story references host-runtime.ts too). Instead mirror App.vue's existing 'watch(() => screen.value.name, applyPhaseMusic)' with a sibling watcher that plays 'scene' on every screen.name change (a new apps/host/src/audio/phase-scene.ts, pure function + the watch call in App.vue) -- same signal CC-7.4 already uses for phase music, so no new coupling into the runtime. 6) Wire ui on a player joining the lobby: in use-host-session.ts's relay onMessage handler, on the player:joined message type. 7) Unit-test each pure piece (the click-predicate, the phase-scene mapping, the join hook) the same way CC-7.4/CC-7.6 did -- no .vue component tests, matching the existing convention.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Per-story Verify: pnpm check && pnpm test && pnpm check:style && pnpm check:deps && pnpm build (repo baseline). Docs/architecture/audio.md is an owner-approved doc (approved 17 September 2026) and is NOT in this story's References -- if its 'Lobby loop' shortlist table (130 BPM, 12 bars) turns out factually wrong once the real tempo is measured, record that as a follow-up for the owner rather than hand-editing the approved doc in this story. ffmpeg and aubio (aubioonset) are on PATH in this environment; aubio's own global 'tempo' command is unreliable here (CC-7.3's own CREDITS.md note: it read 101.46 BPM against the doc's claimed 130; this agent independently measured 110.29 BPM with aubio tempo and 22.154739 s file duration with ffprobe on the already-cut file) -- don't trust a single tempo command's raw output without cross-checking onset spacing. Budgets: 350 KB for the lobby loop, 500 KB total platform audio (docs/architecture/audio.md 'Loading, formats and size').
<!-- SECTION:NOTES:END -->
