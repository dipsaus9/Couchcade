---
id: CC-3.2
title: Add the game menu where the VIP picks a game on their phone
status: Done
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 22:08'
labels:
  - story
dependencies:
  - CC-3.1
  - CC-1.15
  - CC-1.16
references:
  - apps/host/src/screens/menu/
  - apps/controller/src/screens/menu/
  - apps/host/src/runtime/host-runtime.ts
  - apps/host/src/session/use-host-session.ts
  - apps/host/src/App.vue
  - apps/host/test/menu/
  - apps/host/test/runtime/host-runtime.test.ts
  - apps/host/test/runtime/fixtures.ts
  - apps/controller/src/App.vue
  - apps/controller/src/session/state.ts
  - apps/controller/src/screens/lobby/LobbyScreen.vue
  - apps/controller/src/screens/waiting/copy.ts
  - apps/controller/package.json
  - apps/controller/test/menu/
  - apps/controller/test/state.test.ts
  - e2e/games/quick-draw.spec.ts
parent_task_id: CC-3
type: feature
ordinal: 51000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The VIP chooses what to play next.

Type: deliverable
Branch: CC-3.2/game-menu
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The TV menu lists registered games with player counts; games not fitting the current player count are disabled
- [x] #2 The VIP phone shows the list; other phones show "VIP is choosing"
- [x] #3 Picking a game starts it on the host
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Host menu model (apps/host/src/screens/menu/menu.ts): fit rule (min <= seated <= max), sorted entries from the eager registry, MenuView encoding [id,title,flags], VIP-only pick/back, 3 s countdown in room time on an injected scheduler, Surprise me (random fitting game, avoiding the last played when another fits), re-check fit when the countdown ends.
2. Host runtime glue (apps/host/src/runtime/host-runtime.ts): phases lobby -> menu -> playing; ui:action start opens the menu, pick-game (with or without value, from lobby or menu) starts/restarts the countdown, back-to-menu cancels; views: VIP gets lobby{vip:true}/menu, others lobby/vip-choosing/waiting; re-send on presence changes (VIP change, grey state).
3. TV menu screen (apps/host/src/screens/menu/MenuScreen.vue) wired in App.vue and use-host-session.ts: Pick a game, cards with player counts, disabled grey cards, Sunny focus ring + 8px lift + Starting in N on the picked card, VIP name line.
4. Phone: MenuScreen (apps/controller/src/screens/menu/) with the list from the view (CcButton), countdown from startsAt, Back to cancel; lobby VIP buttons Choose a game / Surprise me; vip-choosing copy with the VIP's name; screenOf routes menu.
5. Unit tests: fit rule, VIP-only, countdown start/change/cancel with virtual time, 24 games x 16-char titles < 1 KB, runtime integration, phone view parsing.
6. Amend References with the glue files.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test

Review gate (dipsaus-ai:story-reviewer, sonnet): PASS round 1. AC1-3 met, no scope violations, no findings. Diff excluded the task file and pnpm-lock.yaml (implied by the @couchcade/ui dependency in apps/controller).
References amended with the runtime/session glue and e2e/games/quick-draw.spec.ts (its match now starts through the menu).
Start path for E2E and tools: VIP phone taps 'Choose a game' (ui:action start -> room:phase menu), then taps the game (ui:action pick-game value <id>), the host counts down 3 s in room time, then starts the game (room:phase playing). pick-game without value is Surprise me; back-to-menu cancels. Sending pick-game with a value straight from the lobby also opens the menu and starts the countdown.
Lobby views now carry data {vip: boolean}, so the VIP phone shows Choose a game / Surprise me. Game end still returns to the lobby until CC-3.3 adds results.
Follow-ups: (1) menu view size: 24 games with 16-char titles fit 1 KB only with ids of 9 chars or fewer (1029 bytes with 10-char ids); paging is needed past ~22 games with real ids (14 planned games fit easily). (2) motion-check phase for needsMotion games belongs to CC-5.10; the countdown goes straight to playing. (3) A TV refresh during the menu returns to the lobby until CC-3.5 recovery.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The VIP now picks what to play. The VIP phone gets Choose a game and Surprise me in the lobby, then a game list from the host's menu view ([id, title, flags]) with grey games that don't fit. Tapping a game starts a 3 s countdown in room time that another tap restarts and Back cancels; when it ends the host re-checks the fit and starts the game. The TV shows Pick a game with every registered game, player counts, grey cards and the Sunny focus ring with Starting in N on the pick. Other phones show Watch the TV / <VIP> is choosing a game, then the waiting screen during the countdown. Only the current VIP's ui:actions count. Unit tests cover the fit rule, VIP-only actions, countdown start/change/cancel with virtual time, Surprise me and the 1 KB menu frame; the Quick Draw E2E starts its match through the phone menu.
<!-- SECTION:FINAL_SUMMARY:END -->
