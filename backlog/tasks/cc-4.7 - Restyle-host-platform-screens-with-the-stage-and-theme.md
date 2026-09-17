---
id: CC-4.7
title: Restyle host platform screens with the stage and theme
status: In Progress
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-17 17:46'
labels:
  - story
dependencies:
  - CC-4.6
  - CC-3.2
  - CC-3.3
  - CC-3.8
  - CC-2.6
references:
  - apps/host/src/screens/
parent_task_id: CC-4
type: feature
ordinal: 67000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Lobby, menu, results and calibration on the TV match the approved design.

Type: deliverable
Branch: CC-4.7/restyle-host-screens
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Every screen under apps/host/src/screens/ uses theme tokens and stage components only
- [x] #2 pnpm check:style passes for apps/host
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Restyle apps/host/src/screens/ to consistently use @couchcade/ui shared components (CcButton,
CcPanel, CcPlayerChip, CcPlayerShape) plus theme tokens, replacing hand-duplicated button/panel/
shape markup, per docs/design/platform-screens.md and HOUSE_STYLE.md. Scope is apps/host/src/screens/
only (the story's declared References); packages/stage and games/quick-draw are untouched (another
worker owns Quick Draw TV-text crispness there).

Note on AC1 wording ("stage components"): apps/host's non-gameplay screens (lobby, menu, results,
calibration, passcode) are Vue DOM overlays, not Phaser scenes -- @couchcade/stage only extends
Phaser.Scene/GameObjects and is used exclusively by running games' TV overlays (confirmed via
apps/host/src/App.vue: the Vue #app frame and the Phaser #stage canvas are separate layers, and
the frame is emptied while a game runs). apps/host already imports @couchcade/ui (SeatCard.vue's
CcButton, pre-existing) and PlayerShape.vue's own comment says "CC-4.7 swaps this for the stage and
UI kit versions" -- so I'm reading "stage components" as shorthand for "the shared TV design-system
components", i.e. @couchcade/ui, mirroring CC-4.8's "UI kit components only" for the controller.
Recording this interpretation rather than blocking, since no Phaser-based alternative exists for
Vue overlay screens.

Per-file plan:
- lobby/PlayerShape.vue: keep, narrowed to the one case CcPlayerShape's public API can't cover --
  the lobby's empty-seat preview (design doc: "Empty slots show the shape the next player will
  get", i.e. shape without the player's colour). Comment updated to explain why.
- lobby/SeatCard.vue: CcPlayerShape for an occupied seat (fixes a stroke-weight bug: the old local
  component scaled stroke with icon size instead of holding a fixed 3px/4px per HOUSE_STYLE); local
  PlayerShape.vue stays for the empty-seat preview only. CcButton already used for Kick.
- lobby/LobbyScreen.vue: CcPanel for the players section and JoinPanel; CcButton for Check TV lag /
  Lock room (variant toggles quiet/primary with locked) / End room, keeping the inline lock icon in
  the button's default slot.
- lobby/JoinPanel.vue: CcPanel with tab="Join on your phone" replacing the hand-built tab/panel.
- menu/MenuScreen.vue: CcPlayerShape for player chips (kept as light bespoke chips: CcPlayerChip's
  fixed height/score slot doesn't match the compact players-in-header row); CcPanel for the two
  footer panels.
- results/ResultsScreen.vue: CcPlayerShape for podium and standings shapes (place-number rows stay
  bespoke -- CcPlayerChip has no place-number slot); CcPanel for standings (tab="Points") and the
  two footer panels.
- calibration/CalibrationScreen.vue: CcPlayerShape for the "Last tap" chips; CcPanel for the taps
  panel (tab="Last tap"), the flash/retry panel, and the two footer panels; CcButton for Try again /
  Skip.
- passcode/PasscodeScreen.vue: CcPanel (as="form") replacing the hand-built form panel; CcButton
  (variant=primary, type=submit, block) for Open room.

Everything stays screen="tv" (apps/host is TV-only). Verify: pnpm check && pnpm test, plus
check:style for apps/host (AC2), plus manual 1920x1080 screenshots of every restyled screen for TV
text-crispness review (owner priority per CC-4.11).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test

Restyled every screen under apps/host/src/screens/ to consistently use @couchcade/ui (CcButton, CcPanel, CcPlayerShape) plus theme tokens, replacing hand-rolled duplicate button/panel/shape markup: LobbyScreen, JoinPanel, SeatCard (Kick already used CcButton), MenuScreen, ResultsScreen, CalibrationScreen, PasscodeScreen. lobby/PlayerShape.vue is kept, narrowed to the one case CcPlayerShape's public API can't cover: the lobby's empty-seat shape preview in Sky instead of the player's colour (design doc: "Empty slots show the shape the next player will get"). Fixed a stroke-weight bug along the way: the old local shape component scaled its outline with icon size; CcPlayerShape (and the updated PlayerShape.vue) hold a fixed 4px TV outline per HOUSE_STYLE regardless of size, which is a direct crispness win at 1080p. pnpm check, pnpm test (all 24 workspace projects), pnpm build and pnpm check:style all pass. pnpm check:deps also passes (no import-boundary changes).
<!-- SECTION:NOTES:END -->
