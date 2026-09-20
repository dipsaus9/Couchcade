---
id: CC-7.8
title: Wire Quick Draw's and Target Range's per-moment sound cues
status: In Progress
assignee: []
created_date: '2026-09-19 08:23'
updated_date: '2026-09-20 10:18'
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
- [ ] #1 Every cue in games/target-range/src/host/cues.ts and its Quick Draw equivalent plays the matching @couchcade/audio token when it fires
- [ ] #2 A playtest note confirms sounds are heard for draws, shots/taps, hits/misses and round transitions, not only music and UI clicks
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Wire both games' cue events to @couchcade/audio, following the existing pattern (apps/host/src/audio/*
and docs/architecture/audio.md's "Game sound banks"/"Wiring the existing games" tables, which already
name every cue-to-sound mapping for both games from their specs and CREDITS.md):

1. games/target-range/src/host/sounds.ts (new): defineSounds("target-range", {...}) over every asset
   already in games/target-range/assets/sounds/ (all shipped by CC-11.5/CC-11.4), plus playCueSound(cue)
   turning each TargetRangeCue into the audio.md-specified calls (round/open/draw/shoot/land/tick/
   reveal/roundEnd/over). Tracks the wind-loop SoundHandle and the open->reveal duck release.
2. games/quick-draw/src/host/sounds.ts (new): same shape for QuickDrawCue, over the assets already in
   games/quick-draw/assets/sounds/ (standoff/fake x3/draw/foul/result/over). The `round` cue's
   background music is intentionally NOT wired -- see the sounds.ts header comment and the note below.
3. Both games' scene.ts: create() now does `void audio.load(bank)`, subscribes playCueSound to the
   cue event, and unloads/unsubscribes on Phaser's Scenes.Events.SHUTDOWN (the pattern audio.md's
   "Game sound banks" rules 1 and 4 specify).
4. games/{quick-draw,target-range}/package.json: add "@couchcade/audio": "workspace:*" (needed to
   import it; games/<id>/src/host/ is allowed to import packages/audio per .dependency-cruiser.cjs,
   confirmed by a clean `pnpm check:deps`).
5. Unit tests (games/{quick-draw,target-range}/test/host/sounds.test.ts): spy on the real `audio`
   singleton's play/music/duck (same pattern as apps/host/test/audio/*.test.ts) and assert the right
   call happens for every cue type. This is what "verified" means here -- nobody can hear audio play
   in this environment (see notes).

Verify: pnpm check, check:style, check:deps, test and build are all green in the worktree.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
AC1 status: fully met and tested for Target Range (all 9 cue types: round, open, draw, shoot, land,
tick, reveal, roundEnd, over). For Quick Draw, 7 of 8 cue types are wired and tested (standoff, fake
x3 kinds, draw, foul, result, over); the `round` cue's background music is deliberately NOT wired.
AC1 is left UNCHECKED because of that one gap -- "every cue" isn't yet literally true for Quick Draw.

Why the Quick Draw round/result music is unwired: docs/architecture/audio.md's wiring table calls
for `audio.music(loop)` on `round`, and docs/games/quick-draw.md's spec says the loop also resumes on
`result`. No loop file exists yet -- games/quick-draw/CREDITS.md already records this as a known gap
("Not included in this story... Left as a follow-up for whoever wires playback (CC-7)"), and
docs/architecture/audio.md conflict item 4 assigns trimming it to "the Quick Draw wiring story".

I found the Chiploop source already downloaded in this session's scratchpad (from CC-10.5,
confirmed CC0/iamoneabe via its saved OpenGameArt page) and ffmpeg+aubio are now installed, so
trimming is technically possible. I chose not to, for two reasons: (1) a music loop's whole
requirement is a *seamless* cut ("the last sample flows into the first" per audio.md) -- an
inherently audible property I cannot verify in this sandboxed environment (I can't hear playback,
matching the same constraint as AC2). aubio's beat-tracking on chiploop.mp3 was inconsistent
(clean ~0.36s intervals in some stretches, ~0.60s in others, no confirmed multi-repeat periodicity
like Target Range's CC-11.5 cut had), so I have no confident basis for a clean bar-aligned cut, and
shipping a guessed cut risks an audible click on every game's music loop, every game night. (2) The
fix (a new .ogg in games/quick-draw/assets/sounds/ plus a games/quick-draw/CREDITS.md update) sits
outside this story's declared References (games/*/src/host/, apps/host/src/audio/) -- the backlog-run
worker brief for this story says to stop and report rather than expand scope for that.

Recommendation: a small follow-up story (owning games/quick-draw/assets/sounds/ + CREDITS.md + the
two `audio.music(...)` call sites this file already has TODO comments for) once a human -- the owner,
or an agent that can play audio -- can verify a trimmed loop actually sounds clean. Until then Quick
Draw plays with visuals only during intro/result, same as it does today.

AC2 (playtest note) intentionally left unchecked: this environment cannot play or hear audio, so no
playtest confirmation can be made here. This mirrors CC-11's epic staying open pending CC-11.7's
owner-playtest story. Flagging for the owner's next playtest session, same as the rest of the wired
cues (draws, shots/taps, hits/misses, round transitions) still need an ears-on confirmation too.

Verify green in the worktree: pnpm check, check:style, check:deps, test (317 game tests + full repo
suite), build. games/*/package.json gained "@couchcade/audio": "workspace:*" (needed to import it;
not literally under src/host/, flagging as implied-necessary the same way pnpm-lock.yaml is).
<!-- SECTION:NOTES:END -->
