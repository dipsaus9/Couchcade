---
id: CC-7.4
title: Wire lobby music and platform sound effects on the host
status: Done
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-17 21:21'
labels:
  - story
dependencies:
  - CC-7.2
  - CC-7.3
  - CC-4.7
references:
  - apps/host/src/audio/
  - apps/host/test/audio/
  - apps/host/package.json
  - apps/host/src/App.vue
  - apps/host/src/screens/passcode/PasscodeScreen.vue
  - apps/host/src/screens/menu/MenuScreen.vue
  - apps/host/src/runtime/stage.ts
  - apps/host/test/runtime/stage.test.ts
parent_task_id: CC-7
type: feature
ordinal: 90000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The TV sounds alive in the lobby, menu and results.

Type: deliverable
Branch: CC-7.4/host-sound-wiring
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Lobby music loops; menu and results use ui and celebrate sounds
- [x] #2 Muting via settings silences everything
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add @couchcade/audio as an apps/host dependency.
2. apps/host/src/audio/platform-sounds.ts: defineSounds("platform", {...6 tokens...}) with each
   token's visual from audio.md's table, src = import.meta.env.BASE_URL + "audio/<token>.ogg";
   a separate one-entry music bank for lobbyLoop (bus: music, loop: true). registerPlatformSounds()
   calls audio.setTokens(tokens) and audio.load() on both banks (fetch works pre-unlock; decode
   happens at unlock per audio.md "When files load").
3. apps/host/src/audio/unlock.ts: unlockBeforeOpenRoom(openRoom) (audio.unlock() then delegates,
   used by PasscodeScreen's submit) and watchForUnlock() (capturing pointerdown/keydown on
   document, audio.unlock() while state is "locked", returns a cleanup fn).
4. apps/host/src/audio/click-for-sound.ts: isClickForSoundVisible(state) => state === "locked",
   the pure predicate behind the chip.
5. apps/host/src/audio/phase-music.ts: applyPhaseMusic(name: HostScreen["name"]) maps the phase
   table (lobby/menu/motion -> audio.music(lobbyLoop); calibration -> audio.music(null, {fadeMs:
   400}); results -> audio.play("celebrate") then audio.music(lobbyLoop); passcode/playing -> no
   action here, since "playing" is handled precisely in runtime/stage.ts when the scene starts).
6. apps/host/src/audio/host-settings.ts: readVolumes()/applyHostSettings(), mirroring
   packages/game-sdk's display-lag.ts localStorage pattern (couchcade:host-settings key, v:1,
   defaults on anything missing/corrupt/older, try/catch). CC-7.6 will build the settings UI that
   writes this key; CC-7.4 is the read+apply side audio.md assigns it. This is how AC2 ("muting via
   settings silences everything") is satisfied without CC-7.6 existing yet.
7. apps/host/src/runtime/stage.ts: phaserStage.start() calls audio.music(null) right before adding
   the Phaser scene (audio.md: "the runtime fades the lobby loop out when the scene starts").
8. apps/host/src/screens/passcode/PasscodeScreen.vue: submit() awaits
   unlockBeforeOpenRoom(() => props.openRoom(typed)) instead of calling openRoom directly.
9. apps/host/src/App.vue: on setup, applyHostSettings(); registerPlatformSounds(); a capturing
   unlock watcher (cleaned up on unmount, mirroring the existing resize-listener pattern);
   watch(() => screen.value.name, applyPhaseMusic); a reactive audioLocked ref from
   audio.onStateChange + isClickForSoundVisible, driving a bottom-left "Click for sound" Chalk chip
   inside .frame's existing safe-tv padding.
10. Tests: unit tests for platform-sounds (token/visual coverage, setTokens shape), phase-music
    (spy audio.music/play per phase), unlock (unlockBeforeOpenRoom ordering, watchForUnlock add/
    remove + locked-only gating), click-for-sound (3 states), host-settings (defaults, corrupt,
    throwing storage, muted round-trip), and a stage.test.ts addition for the playing-phase fade.
    No new Vue-mounting test infra: apps/host follows apps/controller's existing convention of
    testing extracted plain-TS logic, not mounting .vue files (host has no @vue/test-utils/browser
    test setup today; packages/ui's is real-Chromium component testing, out of proportion here).
11. Amend References to add apps/host/package.json, apps/host/src/App.vue,
    apps/host/src/screens/passcode/PasscodeScreen.vue, apps/host/src/runtime/stage.ts and their
    tests -- audio.md Conflicts item 8 pre-approves exactly this ("Add those paths to CC-7.4").
12. Manual TV check (audio.md Testing item 7) is the owner's job, not scriptable here; also check
    the lobby-loop seam programmatically if feasible (ffprobe/sample comparison at the loop point)
    and report either way, per the orchestrator's instruction -- don't recut on a guess.
13. pnpm check, check:deps, check:style, test, build; merge origin/main; reviewer (sonnet); push;
    draft PR; CI.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test

Lobby loop seam check (CC-7.3's open item, audio.md Testing item 7): verified programmatically,
since a recut needs ears, not a guess.

Tempo: `aubio tempo` on apps/host/public/audio/lobby-loop.ogg gives 110.29 bpm as its single
summary estimate; per-beat intervals from `aubio beat` (36 beats detected) cluster tightly around
0.606-0.614s (98.6-99.1 bpm) for the bulk of the track, with a few outlier intervals from
subdivisions/missed onsets. This corroborates CC-7.3's own aubio reading (~101.5 bpm) -- the file
is not 130 bpm. The file's length (22.1547s) is exactly 48 beats at 130 bpm (48/130*60=22.154s),
confirming the cut assumed 12 bars at 130 bpm. At the real ~98.7 bpm, 22.1547s is ~36.4 beats
(~9.1 bars) -- not a whole number of bars, so the cut point doesn't land back on the phrase it
started from.

Sample-level join: decoded to raw PCM (ffmpeg -f f32le) and compared the literal last/first
samples -- the jump at the exact join is small (1.3% of local peak), so there's no hard "click".
But the amplitude envelope either side of the join doesn't match: the last ~100ms is sustained at
full level (no fade-out at all, RMS ~0.15-0.24 right up to the last sample) while the first ~20ms
of the file is a near-silent gap (RMS ~0.002-0.004) after a brief 5ms transient, only reaching full
level by ~25-40ms in. So the seam is a sudden drop from full-level music into ~20ms of near-silence
plus a small blip, not a smooth continuation -- likely audible as a brief stutter/dip rather than a
click.

Conclusion: did not recut (would be a guess without listening). Flagging for the owner's manual
check (audio.md Testing item 7) with a specific thing to listen for: a loudness dip/stutter right
at the lobby loop's wrap point, on top of the already-known tempo mismatch. If a recut turns out to
be needed, 9 bars (~21.9s) or 8 bars (~19.5s) at the measured ~98.7 bpm both fit the doc's 16-24s
loop-length rule and would be the tempo-correct target lengths, not another 130 bpm-based cut.

References amended (audio.md Conflicts item 8 pre-approves this: "Unlocking needs one line in
PasscodeScreen.vue, the chip needs a spot on the TV screens, and the runtime fade needs
runtime/stage.ts"): added apps/host/test/audio/, apps/host/package.json (the new @couchcade/audio
dependency), apps/host/src/App.vue (host settings + platform sound registration at boot, the global
unlock listener, the phase-to-music watcher, the "Click for sound" chip), PasscodeScreen.vue (the
submit-time unlock), apps/host/src/runtime/stage.ts + its test (the playing-phase music fade), and
MenuScreen.vue (the `ui` sound on a card getting the focus ring -- AC1's "menu ... use ui ...
sounds", audio.md's platform-tokens table).

Scope note on AC1's wording vs. audio.md's fuller "Platform uses (CC-7.4)" token table: AC1 only
requires "menu and results use ui and celebrate sounds", so that's what's wired (menu: `ui` on the
VIP's card pick/focus ring; results: `celebrate` on the results screen appearing, via
phase-music.ts). The table's other CC-7.4-assigned effect wiring not covered by either AC --
`press` on laptop button clicks/menu countdown ticks/VIP card pick, `scene` on every phase change,
`ui` on a player joining the lobby -- is left as a follow-up rather than expanded scope here, per
"stay strictly within the story's acceptance criteria" (`your-turn`/`foul` are game-specific, wired
by each game's own sound story per the doc's "Wiring the existing games").

Review gate (dipsaus-ai:story-reviewer, sonnet, round 1): verdict pass. Both acceptance criteria met, no scope violations, no findings. Reviewer independently ran pnpm --filter @couchcade/host test and typecheck (both clean) and confirmed every changed path falls inside a declared Reference.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Wired the host app to @couchcade/audio (CC-7.2) and the platform sound files (CC-7.3): apps/host/src/audio/
registers the six house style tokens and the lobby loop (defineSounds, src = import.meta.env.BASE_URL +
"audio/<token>.ogg"), reads the laptop's stored (or default) volumes from the shared couchcade:host-settings
localStorage key and applies them via audio.setVolumes so a stored mute silences everything (AC2; CC-7.6 will
build the settings UI that writes the key), and maps the TV's phase to music (lobby/menu/motion-check keep the
looping lobby track, calibration fades it out 400ms and back, results plays celebrate then fades the loop back
in). PasscodeScreen.vue's submit now opens the browser's autoplay lock as its first statement before the busy
guard; a document-level capturing pointerdown/keydown listener (App.vue) also unlocks on any laptop gesture
while locked; a "Click for sound" Chalk chip shows in the TV's bottom-left safe area until then. The lobby loop
fades out precisely when a game's Phaser scene starts, in runtime/stage.ts (audio.md ties this specific fade to
that file). MenuScreen.vue plays the `ui` token when a card gets the VIP's pick/focus ring, and phase-music.ts
plays `celebrate` for results -- together AC1's "menu and results use ui and celebrate sounds". The doc's fuller
effect-token table also assigns CC-7.4 press-on-clicks, scene-on-phase-change and ui-on-lobby-join wiring beyond
what AC1's literal text requires; that's left as a follow-up, not implemented here, to stay inside the story.

Verified the lobby loop's seam programmatically instead of guessing (CC-7.3's open item): aubio beat-tracking
corroborates CC-7.3's own tempo reading (~98.6-99 bpm core, not the 130 bpm the cut assumed -- the file's
22.1547s length is exactly 48 beats at 130 bpm). The literal sample-to-sample jump at the loop join is small (no
hard click), but the amplitude envelope doesn't match: full-level, unfaded audio right up to the last sample
butts into a ~20ms near-silent gap at the start. Flagged for the owner's manual check (audio.md Testing item 7)
with a specific thing to listen for, not recut on a guess.

Verify: pnpm check, check:deps, check:style, test and build all green across the monorepo; pnpm budgets green
(Host platform JS 420.14 KB of 450 KB); pnpm e2e green (22/22, chromium+webkit). apps/host: 207 tests (19 files),
vue-tsc clean. Reviewer (dipsaus-ai:story-reviewer, sonnet): pass, round 1, no findings, no scope violations.
<!-- SECTION:FINAL_SUMMARY:END -->
