---
id: CC-7.6
title: Add host settings for volume and reduced motion
status: Done
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-17 21:51'
labels:
  - story
dependencies:
  - CC-7.2
  - CC-4.7
references:
  - apps/host/src/settings/
  - apps/host/test/settings/
  - apps/host/src/App.vue
  - apps/host/src/screens/lobby/LobbyScreen.vue
  - apps/host/src/session/use-host-session.ts
parent_task_id: CC-7
type: feature
ordinal: 92000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The host controls sound and motion intensity.

Type: deliverable
Branch: CC-7.6/host-settings
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Settings store mute, music volume, effects volume and reduced motion in localStorage
- [x] #2 Reduced motion disables shake and flashing in stage components
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Build apps/host/src/settings/: settings-storage.ts (pure readSettings/writeSettings over the shared couchcade:host-settings key, reusing CC-7.4's readVolumes/hostSettingsStorageKey for muted/music/effects and adding an independently-defaulted reducedMotion field that falls back to prefers-reduced-motion; writeSettings calls audio.setVolumes directly so mute/volume changes apply live), store.ts (a Vue ref singleton + patchSettings so the panel and the M-key watcher share one source of truth), mute-hotkey.ts (pure isMuteHotkey/isTextFieldFocused predicates + watchMuteHotkey listener), SoundSettings.vue (quiet Sound button + popover CcPanel: mute toggle, music/effects range sliders, reduced-motion toggle, house style). Wire: LobbyScreen.vue renders <SoundSettings/> in its header; App.vue starts watchMuteHotkey() alongside the existing unlock watcher; use-host-session.ts's reducedMotion callback reads settings.value.reducedMotion instead of matchMedia directly. Unit-test the pure modules (settings-storage, mute-hotkey); no .vue tests, matching the existing convention in this app.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test

Amended References (App.vue, LobbyScreen.vue, use-host-session.ts) and AC1 wording (added 'mute') per docs/architecture/audio.md conflict item 5 and the integration gap the doc's References list didn't cover, before implementing.

Round 1 review (block, scope): added apps/host/test/settings/ to References explicitly, matching CC-7.4's own precedent of listing its test dir alongside its src dir.

Epic CC-7 left open on purpose: all 6 planned subtasks (CC-7.1-CC-7.6) are Done and both epic ACs are objectively satisfied (audio.md 'approved by the owner on 17 September 2026'; every registered platform sound in platform-sounds.ts has a required SoundDef.visual field), but Story B of this delivery run adds a new subtask CC-7.7 under this same epic (lobby loop seam fix + wiring the remaining press/scene/ui tokens), so closing CC-7 now would just require reopening it immediately after.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Built apps/host/src/settings/ (settings-storage.ts, store.ts, mute-hotkey.ts, SoundSettings.vue): a mute toggle, two volume sliders and a reduced-motion toggle, all stored in the shared couchcade:host-settings localStorage key CC-7.4 already reads muted/music/effects from. Changes apply to @couchcade/audio immediately via audio.setVolumes. The TV lobby gets a quiet Sound button (LobbyScreen.vue) that opens the panel; the M key mutes on any TV screen except while a text field has focus (App.vue), reusing the existing global unlock listener for the autoplay-lock side effect. use-host-session.ts now feeds the stored (or prefers-reduced-motion-defaulted) setting into HostSceneData.reducedMotion, so the pre-existing stage/Callout no-shake/no-flash behaviour is now settings-driven instead of hardwired to the OS media query. Amended References (added App.vue, LobbyScreen.vue, use-host-session.ts, and test/settings/) and AC1 wording ('mute') before implementing, per docs/architecture/audio.md's own conflict note. Reviewer passed on round 2 (round 1 blocked only on the test-dir Reference, fixed to match CC-7.4's own precedent). No approved design exists yet for the settings panel; it reuses CcButton/CcPanel house-style patterns and the PR flags it for a quick owner look.
<!-- SECTION:FINAL_SUMMARY:END -->
