---
id: CC-6.6
title: Show Pips in the TV lobby and scoreboard
status: Done
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-18 07:12'
labels:
  - story
dependencies:
  - CC-6.4
  - CC-4.7
references:
  - apps/host/src/screens/lobby/
  - packages/stage/src/scoreboard/
  - packages/stage/test/
parent_task_id: CC-6
type: feature
ordinal: 86000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The TV shows everyone's Pip.

Type: deliverable
Branch: CC-6.6/pips-on-tv
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The TV lobby shows each player's Interface Pip rendered in Phaser
- [x] #2 The stage scoreboard chips include the Pip head
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1) AC1 (TV lobby): apps/host/src/screens/lobby/SeatCard.vue -- replace the seated-player CcPlayerShape with CcPip (crop=full, size=140, surface=tv), per pips.md 'Sizes on screen' ('TV lobby player card | Full | 140px'). Empty-seat branch (local PlayerShape component) is unchanged. lobby-state.ts already tracks player.profile (player:profile handler existed pre-CC-6.6), so no state-logic changes needed -- template-only change, matching this codebase's convention of not unit-testing presentational .vue templates (see apps/host/test/, apps/controller/test/: only *-state.ts / pure logic gets dedicated tests). Doc note: AC1's literal wording ('rendered in Phaser') is flagged as wrong in pips.md 'Found while writing this spec' item 2 -- the lobby is a Vue screen using CcPip, only the stage scoreboard is Phaser; delivering to the doc's corrected intent ('The TV lobby shows each player's Interface Pip'), not the literal AC text. 2) AC2 (stage scoreboard): new packages/stage/src/scoreboard/pip-head.ts -- buildInterfacePipHead/interfacePipHeadKey, a cached Phaser canvas texture (mirrors buildWorldPip's cache-by-key pattern) built by replaying @couchcade/theme's Pip element data (pipHead/pipHairBack/Front/pipJersey/pipJerseyNeck/pipEyes/pipMouth) onto a 2D context with Path2D (SVG d-string parsing), baked at 2x the 56px display size for crisp 4K. Implementation note: pips.md describes 'an SVG data URI loaded as a texture'; built via synchronous canvas+Path2D instead (same source geometry, same pixels, no async texture-readiness race against the Scoreboard's frequent rebuilds) -- flagging the technique deviation, not a behaviour change. The chest shape mark is intentionally omitted: it's ui-tier geometry (packages/ui/src/components/shapes.ts) stage can't import (kit packages never import each other); it barely enters the head crop anyway (mark at y89, crop ends y92). Wired into packages/stage/src/scoreboard/index.ts's Scoreboard#draw: REPLACES the existing plain player-shape icon (was going to add the Pip head alongside the shape per platform-screens.md's game-menu chip listing 'Pip head, shape, name', but empirically an 8-seat scoreboard + round counter overflows the 1728px safe area by several hundred px with both present, proven by the existing 'fits eight players' test) -- flagging this as a design call for the owner since it trades the redundant shape+colour accessibility cue for capacity; the chip's name still sits next to the Pip (colour is not this chip's only cue) and the jersey colour still shows through the bottom of the head crop.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test

Reviewer round 1 (dipsaus-ai:story-reviewer, model sonnet): PASS. Both acceptance criteria met (AC1 judged against pips.md's corrected intent per 'Found while writing this spec' item 2, since the literal AC wording is a documented doc bug). No scope violations. Reviewer independently reran the full stage test suite (69/69, real headless Chromium) and independently reproduced the shape+Pip-head overflow claim in a disposable worktree (602px overflow of the 1728px safe area at the most aggressive compaction step), confirming the replace-not-add design call was forced, not stylistic. Advisory: reworded the accessibility justification to credit the player name (not the jersey sliver) as the real 'colour is never the only cue' fallback; ran pnpm budgets per pips.md's Budgets table -- Host platform JS 422.65/450 KB, all 10 budgets pass.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The TV shows everyone's Pip. apps/host/src/screens/lobby/SeatCard.vue now renders a seated player's Interface Pip (full, 140px) instead of the plain shape icon, per pips.md's Sizes-on-screen table; AC1's literal 'rendered in Phaser' wording is stale per pips.md's own flag (item 2) and was delivered to the corrected intent instead ('The TV lobby shows each player's Interface Pip'). packages/stage/src/scoreboard/pip-head.ts adds buildInterfacePipHead/interfacePipHeadKey: a cached Phaser canvas texture built from the same @couchcade/theme Pip part data CcPip draws, via Path2D instead of an async SVG-data-URI image load (documented deviation, same pixels, no async race against the Scoreboard's frequent rebuilds). Scoreboard#draw now shows this 56px Pip head per chip, replacing (not adding alongside) the old plain player-shape icon -- a design call flagged for the owner: the doc's other player-chip locations (Vue game menu) list 'Pip head, shape, name' together, but an 8-seat scoreboard plus round counter empirically overflows the TV safe area by several hundred px with both present (caught by the existing 'fits eight players' test), so the shape was dropped there specifically; the chip's name is still the adjacent non-colour cue and the jersey colour still shows through the bottom of the head crop. pnpm check, check:deps, check:style, test and build all green.
<!-- SECTION:FINAL_SUMMARY:END -->
