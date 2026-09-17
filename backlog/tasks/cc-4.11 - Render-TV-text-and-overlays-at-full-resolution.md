---
id: CC-4.11
title: Render TV text and overlays at full resolution
status: To Do
assignee: []
created_date: '2026-09-17 08:56'
updated_date: '2026-09-17 08:56'
labels:
  - story
dependencies: []
references:
  - packages/stage/
  - apps/host/src/runtime/stage.ts
  - games/quick-draw/src/host/
  - games/quick-draw/test/host/
  - docs/architecture/platform.md
parent_task_id: CC-4
priority: high
type: feature
ordinal: 206000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Text and UI on the TV are sharp and readable from the couch, while game worlds keep their crisp pixel-art look. Today the host canvas is 480×270 scaled up, so overlay text (names, scores, callouts, instructions) is drawn at world resolution and is unreadable (owner feedback after the first live playtest, 2026-09-17).

Type: deliverable
Branch: CC-4.11/tv-text-resolution
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The host canvas renders at the TV's output resolution (e.g. 1920×1080 on a 1080p screen, capped for performance) while the game world keeps a 480×270 logical size drawn with whole-number zoom and nearest-neighbour scaling
- [ ] #2 @couchcade/stage overlays (scoreboard, callouts, room code panel, panels and labels) render text at output resolution with the HOUSE_STYLE type scale in 1080p design pixels
- [ ] #3 Quick Draw's TV scene text (instructions, names, reaction times, FOUL!/BANG!, fake-out words) is drawn on the full-resolution overlay, not in the pixel world
- [ ] #4 A browser test renders a Quick Draw round at 1920×1080 and asserts overlay text is drawn at output resolution (e.g. glyph edge sharpness or canvas/text scale checks), and the existing stage and scene boot tests still pass
- [ ] #5 docs/architecture/platform.md records the rendering rule: pixel-art world at 480×270 logical, overlays and text at output resolution
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Owner said 2026-09-17: the style is good, but the quality is too low so the text is not readable; fix that. Keep the Clubhouse pixel-art style. CC-4.6 notes: tvPx = 1080p design values / 4 today. CC-10.8 notes: Quick Draw extends StageScene and draws FOUL!/BANG!/instruction panel with stage helpers on the overlay layer. Keep the e2e hook in apps/host/src/runtime/stage.ts (phaserStage.start) working.
<!-- SECTION:NOTES:END -->
