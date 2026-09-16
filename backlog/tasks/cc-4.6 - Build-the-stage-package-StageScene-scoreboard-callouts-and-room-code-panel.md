---
id: CC-4.6
title: 'Build the stage package: StageScene, scoreboard, callouts and room code panel'
status: Done
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 21:10'
labels:
  - story
dependencies:
  - CC-4.1
  - CC-4.2
  - CC-1.13
references:
  - packages/stage/
parent_task_id: CC-4
type: feature
ordinal: 66000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Games never draw their own TV interface.

Type: deliverable
Branch: CC-4.6/stage-package
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 StageScene owns an overlay layer above the game world
- [x] #2 The scoreboard shows player chips with shapes in join order and highlights the active player
- [x] #3 Callouts follow the house style treatment with a reduced-motion variant
- [x] #4 The room code panel sits bottom-right inside the 5% safe area
- [x] #5 A headless boot test renders each component
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. New workspace package @couchcade/stage (kit tier; deps phaser, theme, game-sdk/protocol types).
2. layout/: tvPx (1080p design px -> 480x270 world px, x1/4), integer safe area (5%), overlay depth.
3. draw/: slab (Chalk fill, Ink outline, hard Ink shadow, pill/panel radius), 7x7 pixel player shapes with 1px Ink outline, text styles from the theme type scale.
4. scene/: StageScene extends Phaser.Scene; lazy overlay Layer at a depth above the world; reads reducedMotion from HostSceneData; addScoreboard/addCallout/addRoomCode.
5. scoreboard/: chips in join order (seated players by joinedAt), round counter chip in the middle, active chip lifts 8 TV px with a Sunny ring, names truncated to fit.
6. callout/: Sunny Pixelify callout, Ink stroke, hard shadow, -4deg, celebrate pop + shake; reduced motion fades in without scaling or shake.
7. room-code/: Chalk panel with code and join URL, bottom-right at the safe area edge.
8. test/: Vitest browser mode (Playwright Chromium) boots Phaser and checks each component with renderer pixel snapshots and bounds.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test

Overlay units: the host canvas is 480x270 at integer zoom, so every overlay size is the 1080p design value divided by 4 (tvPx). Outline 1 world px, panel depth 2 (6/4 rounded), chip height 18, lift 2, Sunny ring 1. Player shapes are 7x7 pixel masks with a 1px Ink outline, because vector shapes at 8 world px turn to mush. Text renders at world resolution: Pixelify scores and callouts read well, 6-8px Fredoka is chunky. A crisp overlay would need the host canvas at output resolution with the world camera zoomed (follow-up, not in this story).
Scoreboard fit: one centred row (first half, round counter, second half). When it is too wide, names shorten evenly, then the Round label goes, then names go (shape stays), then scores drop to the action size.
Callout: strokeThickness is twice the 4px outline because canvas strokes are centred on the letter edge and the fill covers the inner half. celebrate = Back.Out scale over 900 ms plus a 1 world px camera shake; reduced motion = 180 ms alpha fade, no scale, no shake.

Review (story-reviewer, round 1): pass, all 5 criteria met, no scope violations. Advisories: callout ease now maps the theme 'pop' token (fixed); package description reworded (fixed); scoreboard can still overflow if the last compaction step doesn't fit (very large scores with 8 players, left as a follow-up); the test script installs chromium-headless-shell each run (same as @couchcade/ui, kept).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added @couchcade/stage (tier 3 kit). StageScene extends Phaser.Scene and owns a lazily created overlay Layer at depth 1,000,000, reads HostSceneData (reducedMotion), and adds the overlays: Scoreboard (seated players in join order, Chalk pill chips with 7x7 pixel player shapes and 1px Ink outline, names in Fredoka and scores in Pixelify, round counter chip in the middle of a centred row, active chip lifted 2 world px (8 TV px) with a Sunny ring, graceful compaction for 8 players), Callout (uppercase Sunny Pixelify with Ink stroke, hard Ink shadow, -4 degrees, celebrate pop + 1px screen shake, reduced-motion 180 ms fade without scale or shake, holdMs auto-dismiss) and RoomCodePanel (Chalk panel with code and join URL, right edge and shadow on the 5% safe area edge, grows left). Sizes are 1080p design values divided by 4 via tvPx. Boot tests run Phaser in Chromium via Vitest browser mode and read rendered pixels for every component.
<!-- SECTION:FINAL_SUMMARY:END -->
