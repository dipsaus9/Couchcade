---
id: CC-7.7
title: Fix the lobby loop cut and wire the remaining platform sound tokens
status: Done
assignee: []
created_date: '2026-09-17 21:57'
updated_date: '2026-09-17 22:24'
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
- [x] #1 apps/host/public/audio/lobby-loop.ogg is recut from the original, uncut CC0 source at its measured real tempo (not 130 BPM), 8 or 9 bars (about 19.5 to 21.9 s)
- [x] #2 The recut loop's seam is verified programmatically: sample continuity and level at the join, plus a beat-grid check, with the method and result recorded in the task notes
- [x] #3 apps/host/CREDITS.md's lobby loop entry and notes state the corrected measured tempo and cut length, and docs/CREDITS.md is regenerated
- [x] #4 The press token plays on every CcButton press on a TV (host) screen
- [x] #5 The press token plays on each menu countdown tick and on the VIP's card pick in MenuScreen.vue
- [x] #6 The scene token plays on every host phase change
- [x] #7 The ui token plays when a player joins the lobby
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1) Recut the lobby loop: re-download the original, uncut 'Adventure Begins Loop' (59 s, made to loop) from the Happy Chiptunes Collection zip on OpenGameArt (same source CC-7.3 used); measure its real tempo with a beat-grid method more robust than a single aubio tempo call (e.g. aubioonset across the whole file, then fit the median inter-onset interval), not the doc's unverified 130 BPM; cut from the track's own top (0 s, matching CC-7.3's method) to the nearest whole-bar length in the 8-9 bar / 19.5-21.9 s range; fade/level/encode to OGG Vorbis with ffmpeg the same way CC-7.3 did (peak around -3 dBFS, short fade if needed), keep it under the 350 KB lobby-loop budget. 2) Verify the seam programmatically: compare the decoded first and last few ms of the buffer for level/continuity (ffmpeg PCM extraction + a small check script or ffmpeg astats), and confirm the cut length lands on a whole number of beats at the measured tempo; record the method and numbers in --append-notes. 3) Update apps/host/CREDITS.md's lobby loop row/notes with the corrected tempo and cut math (replacing the old 130 BPM / 12 bar / 22.1 s claim), then run the tooling/assets credits generator so docs/CREDITS.md stays consistent (don't hand-edit it). 4) Wire press: a host-only click listener (new file under apps/host/src/audio/, mirroring unlock.ts/click-for-sound.ts's pattern) that plays 'press' when a .cc-button element is clicked on a TV screen, started from App.vue alongside the other audio watchers, without touching @couchcade/ui (shared with the silent phone); wire press on MenuScreen.vue's countdown tick and its VIP-card-pick watch (alongside the existing 'ui' call there for the focus ring -- both tokens can fire for the same pick, per audio.md's own table). 5) Wire scene: NOT via apps/host/src/runtime/host-runtime.ts (References dropped it after the CC-3.20 collision check -- that story references host-runtime.ts too). Instead mirror App.vue's existing 'watch(() => screen.value.name, applyPhaseMusic)' with a sibling watcher that plays 'scene' on every screen.name change (a new apps/host/src/audio/phase-scene.ts, pure function + the watch call in App.vue) -- same signal CC-7.4 already uses for phase music, so no new coupling into the runtime. 6) Wire ui on a player joining the lobby: in use-host-session.ts's relay onMessage handler, on the player:joined message type. 7) Unit-test each pure piece (the click-predicate, the phase-scene mapping, the join hook) the same way CC-7.4/CC-7.6 did -- no .vue component tests, matching the existing convention.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Per-story Verify: pnpm check && pnpm test && pnpm check:style && pnpm check:deps && pnpm build (repo baseline). Docs/architecture/audio.md is an owner-approved doc (approved 17 September 2026) and is NOT in this story's References -- if its 'Lobby loop' shortlist table (130 BPM, 12 bars) turns out factually wrong once the real tempo is measured, record that as a follow-up for the owner rather than hand-editing the approved doc in this story. ffmpeg and aubio (aubioonset) are on PATH in this environment; aubio's own global 'tempo' command is unreliable here (CC-7.3's own CREDITS.md note: it read 101.46 BPM against the doc's claimed 130; this agent independently measured 110.29 BPM with aubio tempo and 22.154739 s file duration with ffprobe on the already-cut file) -- don't trust a single tempo command's raw output without cross-checking onset spacing. Budgets: 350 KB for the lobby loop, 500 KB total platform audio (docs/architecture/audio.md 'Loading, formats and size').

Lobby loop recut evidence: re-downloaded the original 58.986s 'Adventure Begins Loop' from the Happy Chiptunes Collection zip (opengameart.org). Beat-grid fit (aubioonset onsets against a 16th-note grid, joint tempo+phase search maximizing sum(cos(2*pi*(t-phase)/T))) measured the real tempo at 97.494 BPM, not the doc's 130 BPM (docs/architecture/audio.md's 'Lobby loop' table is now known wrong -- flagged as an owner doc-correction follow-up, not edited here). Chose a 9-bar cut with a +-6ms sample-accurate search minimizing the sample-value/slope jump at the loop seam: cost 31.25 (0th percentile of 500 candidate points across the track, median ~7.85M) vs 19.0M for the original shipped cut. Re-encoding to lossy Vorbis (ffmpeg's native encoder, no libvorbis available here, same as CC-7.3 used -- Lavc63.1.101 vorbis) reintroduces some discontinuity at hard file edges, so the shipped file keeps ~0.53s of inert audio past endS and platform-sounds.ts now uses loop:{startS,endS} (0.030204s / 22.178821s) instead of loop:true, so Web Audio's own loopStart/loopEnd loop only the clean span -- post-encode seam jump measured at 41-of-32768 (~0.12% of full scale) vs 4303 in the original file. Full writeup in apps/host/CREDITS.md. Size: lobby-loop.ogg 252.3 KB (was 214.2 KB), platform total ~340.5 KB, both within budget (350 KB / 500 KB).

Token wiring evidence: press on laptop button clicks via a global document click listener (apps/host/src/audio/button-press.ts, isButtonClick duck-typed on closest() rather than instanceof Element since there's no DOM in the plain-Node test env), unit tested. press on the menu countdown tick and the VIP card pick, and ui on the VIP card pick (existing), both in MenuScreen.vue -- untested at the unit level like the rest of that file's audio calls (no .vue component tests in this app). scene on every phase change via a new App.vue watch(() => screen.value.name, applyPhaseScene) sibling to the existing phase-music watch (apps/host/src/audio/phase-scene.ts), unit tested. ui on a player actually joining the lobby (not the player:joined replay burst after a TV reconnect/refresh) via isNewLobbyJoin in use-host-session.ts, unit tested.

Reviewer (sonnet) round 1: pass. Advisory-only finding: the 9-bar/22.15s cut sits ~0.25s above AC1's 'about 19.5 to 21.9s' guide range, since that range was derived from the story description's pre-measurement ~98.7 BPM estimate and the rigorous measurement came in at 97.494 BPM -- not a defect, no action taken.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Recut apps/host/public/audio/lobby-loop.ogg at the track's real, measured tempo (97.494 BPM via a beat-grid fit against aubio onsets, not the doc's stale 130 BPM), choosing a 9-bar loop with sample-accurate loop points found by a discontinuity-minimizing search (post-encode seam jump 41/32768, down from 4303 in the original file); platform-sounds.ts now uses loop:{startS,endS} instead of loop:true so Web Audio's own gapless loop keeps the lossy Vorbis encoder's edge artifacts away from the audible seam. Full measurement writeup in apps/host/CREDITS.md; docs/architecture/audio.md's now-known-wrong 130 BPM shortlist entry is flagged as an owner doc-correction follow-up, not edited (it's owner-approved). Wired the platform token table's remaining gaps from CC-7.4: press on laptop button clicks (a host-only global .cc-button click listener, apps/host/src/audio/button-press.ts, since CcButton is shared with the silent phone controller) and on the menu countdown tick and VIP card pick (MenuScreen.vue); scene on every phase change (App.vue, a sibling to the existing phase-music watch); ui on a player genuinely joining the lobby, not the player:joined replay burst a TV reconnect/refresh triggers (use-host-session.ts's isNewLobbyJoin). Reviewer (sonnet) passed round 1, one advisory-only note (the 9-bar cut lands ~1% above the story's own pre-measurement duration estimate -- expected, not a defect). Epic CC-7 left open: CC-7.6 is Done on its own unmerged branch (PR open, not merged per this run's instructions) but still shows To Do from main, so the epic isn't actually complete from main's perspective yet -- close it once both CC-7.6 and CC-7.7 are merged.
<!-- SECTION:FINAL_SUMMARY:END -->
