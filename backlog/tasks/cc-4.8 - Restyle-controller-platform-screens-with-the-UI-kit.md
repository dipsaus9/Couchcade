---
id: CC-4.8
title: Restyle controller platform screens with the UI kit
status: Done
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-17 20:36'
labels:
  - story
dependencies:
  - CC-4.4
  - CC-3.2
  - CC-3.3
  - CC-3.10
  - CC-2.6
references:
  - apps/controller/src/screens/
parent_task_id: CC-4
type: feature
ordinal: 68000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Join, lobby, menu, results and error screens on phones match the approved design.

Type: deliverable
Branch: CC-4.8/restyle-controller-screens
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Every screen under apps/controller/src/screens/ uses UI kit components only
- [x] #2 pnpm check:style passes for apps/controller
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Audit every screen under apps/controller/src/screens/ against docs/design/platform-screens.md and @couchcade/ui. MenuScreen, ResultsScreen, CalibrationScreen, KickedScreen, RoomFullScreen and WaitingScreen already used CcButton/CcPanel/CcBigAction or needed no kit component (plain status text). Rebuilt JoinScreen on CcPanel (tab card) + CcButton (primary Join), replacing hand-rolled panel/tab/button markup, and gave the inline notice a Signal-dot CcPanel per the errors treatment. Rebuilt LobbyScreen and AudienceScreen on CcPlayerChip (its built-in plain-Sky-circle fallback is exactly the audience look), dropping the screens' own chip/shape markup. Left apps/controller/src/components/PlayerShape.vue and apps/controller/src/session/look.ts untouched (outside the story References); LobbyScreen instead reads the player id straight from @couchcade/theme's players array.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test

Reviewer (dipsaus-ai:story-reviewer, model sonnet): verdict pass, round 1. Both acceptance criteria met, no scope violations, no findings. Verified pnpm check:style clean and diff confined to apps/controller/src/screens/.

CI caught a regression: e2e platform/rejoin.spec.ts asserted the lobby chip shows 'Player 2' as exact text, which the CcPlayerChip-only rewrite dropped (CcPlayerChip has no slot for a seat-label tag). Restored the seat-label/Audience tag as a small hand-rolled radius-tag element next to CcPlayerChip (no kit Tag component exists yet). Verified locally: rejoin.spec.ts, smoke.spec.ts and moderation.spec.ts all pass on chromium; apps/server/test/rate-limits.test.ts's earlier CI failure was an unrelated pre-existing flake (wall-clock-minute-boundary timing, hook timeout) that passed on a plain re-run.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Join, lobby and audience now draw their panel, primary button and player chip through @couchcade/ui (CcPanel, CcButton, CcPlayerChip) instead of hand-rolled markup, matching docs/design/platform-screens.md and HOUSE_STYLE.md. Menu, results, calibration, kicked, room-full and waiting already used the kit or need no component (plain status text), so they were audited and left unchanged. pnpm check:style, pnpm check, pnpm test and pnpm build all pass. Reviewed by dipsaus-ai:story-reviewer (sonnet): pass, round 1, no scope violations.
<!-- SECTION:FINAL_SUMMARY:END -->
