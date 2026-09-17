---
id: CC-4.11
title: Render TV text and overlays at full resolution
status: Done
assignee: []
created_date: '2026-09-17 08:56'
updated_date: '2026-09-17 09:34'
labels:
  - story
dependencies: []
references:
  - packages/stage/
  - apps/host/src/runtime/stage.ts
  - apps/host/test/runtime/stage.test.ts
  - apps/host/src/stage/
  - apps/host/test/zoom.test.ts
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
- [x] #1 The host canvas renders at the TV's output resolution (e.g. 1920×1080 on a 1080p screen, capped for performance) while the game world keeps a 480×270 logical size drawn with whole-number zoom and nearest-neighbour scaling
- [x] #2 @couchcade/stage overlays (scoreboard, callouts, room code panel, panels and labels) render text at output resolution with the HOUSE_STYLE type scale in 1080p design pixels
- [x] #3 Quick Draw's TV scene text (instructions, names, reaction times, FOUL!/BANG!, fake-out words) is drawn on the full-resolution overlay, not in the pixel world
- [x] #4 A browser test renders a Quick Draw round at 1920×1080 and asserts overlay text is drawn at output resolution (e.g. glyph edge sharpness or canvas/text scale checks), and the existing stage and scene boot tests still pass
- [x] #5 docs/architecture/platform.md records the rendering rule: pixel-art world at 480×270 logical, overlays and text at output resolution
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Research Phaser 4.2.1 (bundled docs: Pixel Art Guide, cameras/text skills; source: Config pixelArt/roundPixels, willRoundVertices, Text resolution, CameraManager lifecycle). Choice: canvas at output resolution; StageScene owns two cameras: main = world camera at the largest whole-number zoom over a centred 480x270 viewport (nearest-neighbour via pixelArt), overlay camera = same viewport at zoom z/4 so the overlay layer is laid out in 1920x1080 design pixels; each camera ignores the other's objects. Text resolution follows the overlay zoom (HiDPI/4K). 2. packages/stage: layout in design px (safe area 96/54, metrics 4/6/20, overlay size 1920x1080, worldToOverlay x4), stage viewport maths, camera setup + resize in StageScene, drawPlayerShape pixel size, scoreboard/callout/room code in design px; tests boot at 1920x1080 with the self-hosted fonts. 3. apps/host: boot the canvas at window size x devicePixelRatio, capped at 3840x2160 pixels, CSS size = window; runtime/stage.ts waits for Fredoka and Pixelify Sans (document.fonts.load, bounded) before starting a scene; phaserStage.start hook unchanged. 4. Quick Draw host: tags, BANG!, instruction panel and callout position in design px (world positions x4); browser tests at 1920x1080 incl. an output-resolution text check (scale/resolution and glyph sharpness). 5. docs/architecture/platform.md: TV rendering rule and why. 6. Before/after headless screenshots; iterate. References widened at pickup: apps/host/src/stage/ (canvas boot) and apps/host/test/zoom.test.ts, since AC1's canvas size lives in stage/boot.ts, not runtime/stage.ts.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Owner said 2026-09-17: the style is good, but the quality is too low so the text is not readable; fix that. Keep the Clubhouse pixel-art style. CC-4.6 notes: tvPx = 1080p design values / 4 today. CC-10.8 notes: Quick Draw extends StageScene and draws FOUL!/BANG!/instruction panel with stage helpers on the overlay layer. Keep the e2e hook in apps/host/src/runtime/stage.ts (phaserStage.start) working.

Review gate round 1 (dipsaus-ai:story-reviewer): verdict pass. AC1-5 met, no scope violations (References were widened at pickup to apps/host/src/stage/, apps/host/test/zoom.test.ts and apps/host/test/runtime/stage.test.ts, because the canvas boot lives in stage/boot.ts). Advisory: StageScene wraps Systems#init (protected in Phaser's types) to subscribe to START; revisit on a Phaser upgrade. pnpm-lock.yaml and the task file were left out of the reviewer diff on purpose.
Research (Phaser 4.2.1 bundled Pixel Art Guide + camera/text/scale skills + source): pixelArt sets antialias off and roundPixels on; vertices are only rounded for an unzoomed camera and an unscaled object (willRoundVertices safeAuto), so a zoomed world camera plus an unzoomed overlay camera is the fit. Shake intensity is multiplied by camera size and zoom (shakeIntensity helper). Text resolution follows the overlay zoom for 4K. Tweens run on wall-clock time (TweenManager.getDelta uses Date.now), which matters for headless frame-stepped screenshots.
Screenshots (headless Chromium, 1920x1080): before (480x270 canvas scaled x4) vs after (1080p canvas), plus the real app via Playwright. Winner time tags now sit above BANG! instead of under it. Room code isn't passed to game scenes today, so it is only on the TV in the lobby; the screenshot harness added the panel to show it.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
TV text and overlays now render at the screen's resolution while the world stays 480x270 pixel art. apps/host boots the Phaser canvas at window x devicePixelRatio (1920x1080 on a 1080p TV, capped at 4K pixels, CSS-scaled above) and waits up to 3 s for Fredoka and Pixelify Sans before starting a scene (phaserStage.start hook unchanged). @couchcade/stage: StageScene sets up two cameras over a centred 16:9 box, the world camera at the largest whole-number zoom (x4 at 1080p) and an overlay camera at zoom/4 that draws only the overlay layer in 1920x1080 overlay pixels with roundPixels; each ignores the other's objects and overlay text rasterises at the overlay zoom. Layout, scoreboard, callout, room code and draw helpers use 1080p design values directly (tvPx removed; worldToOverlay, stageViewport, shakeIntensity added). Quick Draw's tags, BANG!, instruction panel and callouts are positioned in overlay pixels; winner time tags sit above BANG!. Tests: stage browser tests at 1920x1080 with real fonts (viewport maths, camera split, 4K text resolution, resize), a Quick Draw browser test asserting overlay text is drawn 1:1 at output resolution with glyph-edge sharpness, host canvasSize and font-wait unit tests. docs/architecture/platform.md gains 'TV rendering (CC-4.11)' with the rule and why.
<!-- SECTION:FINAL_SUMMARY:END -->
