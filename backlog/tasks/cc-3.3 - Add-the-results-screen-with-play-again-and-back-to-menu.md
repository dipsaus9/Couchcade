---
id: CC-3.3
title: Add the results screen with play again and back to menu
status: Done
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 22:42'
labels:
  - story
dependencies:
  - CC-3.1
  - CC-1.15
  - CC-1.16
references:
  - apps/host/src/screens/results/
  - apps/controller/src/screens/results/
  - apps/host/src/runtime/host-runtime.ts
  - apps/host/src/App.vue
  - apps/host/src/session/use-host-session.ts
  - apps/host/test/runtime/host-runtime.test.ts
  - apps/host/test/runtime/fixtures.ts
  - apps/host/test/results/
  - apps/controller/src/App.vue
  - apps/controller/src/session/state.ts
  - apps/controller/test/state.test.ts
  - apps/controller/test/results/
  - e2e/games/quick-draw.spec.ts
parent_task_id: CC-3
type: feature
ordinal: 52000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
After a game everyone sees who won and chooses what happens next.

Type: deliverable
Branch: CC-3.3/results-screen
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The TV shows final standings with player shapes
- [x] #2 The VIP phone offers "Play again" and "Back to menu"; other phones show their placement
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. apps/host/src/screens/results/results.ts: pure functions/factory createGameResults(game, outcome, in-game players, lobby()) - resultsStandings (place, score, ties), resultsHeadline (1/2/3+ winners), podium (place<=3), placeLabel ordinal, canPlayAgain/hint from menu.ts's fits/playerCountLabel, views() building ControllerView per seated player: VIP gets results+vip{canPlayAgain,hint}, other in-game get results+placement, seated-not-in-game get next-game.
2. apps/host/src/screens/results/ResultsScreen.vue: TV screen, tag/headline/podium/standings chips with PlayerShape, read-only footer ("<VIP> picks what's next"). CC-4.7 restyles later, same convention as MenuScreen.vue.
3. apps/host/src/runtime/host-runtime.ts: add "results" to HostPhase, end(outcome) builds results via createGameResults instead of returning to lobby, wires onPlayAgain (calls start() again with same game/new seed/current lobby) and onBackToMenu (reopens menu via menu.action(vipId,{action:"start"})), routes ui:action play-again/back-to-menu to results when phase is results, re-shows results views on presence changes, exposes `results` getter for the TV.
4. apps/host/src/App.vue + use-host-session.ts: add "results" screen name/branch wired to ResultsScreen.
5. apps/controller/src/screens/results/results-view.ts: ResultsView type+parser+placeLabel+resultsActions (play-again/back-to-menu ui:action builders).
6. apps/controller/src/screens/results/ResultsScreen.vue: phone screen, placement for everyone, Play again/Back to menu only when view.vip present (CcButton, disabled+hint when can't play again).
7. apps/controller/src/session/state.ts + App.vue: add "results" PhoneScreen, screenOf branch (online && hostConnected && parseResultsView), wire ResultsScreen.
8. Update e2e/games/quick-draw.spec.ts: after round 3 assert TV results (headline "Ana wins!"), Ana (VIP) sees Play again/Back to menu, Ben sees his placement ("2nd") - instead of asserting a return to the lobby.
9. Unit tests: apps/host/test/results/results.test.ts (standings with ties incl. 2-way and 3+-way ties, headline text, canPlayAgain/hint, VIP-only action gating, views() routing incl. seated-not-in-game -> next-game), extend apps/host/test/runtime/host-runtime.test.ts (outcome -> results phase, views, play-again restarts with new seed/current players, back-to-menu reopens menu), apps/controller/test/results/results-view.test.ts (parse, placeLabel, action builders), extend apps/controller/test/state.test.ts (screenOf results branch).
10. Amend References (backlog CLI) with runtime/glue files touched: apps/host/src/runtime/host-runtime.ts, apps/host/src/App.vue, apps/host/src/session/use-host-session.ts, apps/host/test/runtime/host-runtime.test.ts, apps/controller/src/App.vue, apps/controller/src/session/state.ts, apps/controller/test/state.test.ts, e2e/games/quick-draw.spec.ts. Tell the reviewer these plus pnpm-lock.yaml (if touched) are implied/expected beyond the original References.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test

References amended to cover the runtime/session glue this story had to touch to wire the results phase in: apps/host/src/runtime/host-runtime.ts (new 'results' phase, GameResults wiring, play-again/back-to-menu routing), apps/host/src/App.vue and use-host-session.ts (ResultsScreen wiring), apps/host/test/runtime/host-runtime.test.ts and fixtures.ts (playAgainAction fixture, updated/added runtime tests), apps/controller/src/App.vue and session/state.ts (results PhoneScreen + screenOf branch), apps/controller/test/state.test.ts, and e2e/games/quick-draw.spec.ts (asserts the results screen instead of a return to the lobby, per the story brief). pnpm-lock.yaml is untouched (no new dependencies). Reviewer: please re-pass all References against this amended list.

Reviewer (dipsaus-ai:story-reviewer, round 1): verdict pass. AC1 met (TV podium+standings with PlayerShape, theme colours). AC2 met (VIP-only vip{canPlayAgain,hint} block gates Play again/Back to menu on the phone; others get placement only; verified by unit tests and the rewritten e2e). No scope violations across the amended References. Advisory only: (1) seated-not-in-this-game players get screen 'next-game', which the controller's screenOf has no case for yet and falls back to the generic waiting screen -- a pre-existing gap (the 'playing' phase has the same unhandled next-game name), left for a follow-up story (CC-3.10 territory) rather than fixed here; (2) resultsHeadline's 'It's over!' fallback for zero place-1 winners is an edge case outside session-flow.md's documented headline rules, kept as a reasonable defensive default.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added the results screen (docs/architecture/session-flow.md, 'Results'): when a game's outcome resolves, the host runtime stops the loop/scene and moves to a new 'results' phase (apps/host/src/runtime/host-runtime.ts). apps/host/src/screens/results/results.ts computes standings (place, score, ties share a place), the headline ('X wins!', 'X and Y win!', 'It's a tie!'), the podium (places 1-3), and per-phone views: the VIP gets their own placement plus a vip{canPlayAgain,hint} block (Play again is disabled with '<title> needs N players' when the game no longer fits the current seat count), other in-game players get just {place, of, score}, and a seated player who wasn't in this game gets 'next-game'. ResultsScreen.vue renders the TV (podium + standings panel with player shapes and colours) and the phone (placement, and for the VIP, Play again / Back to menu via CcButton). 'Play again' restarts the same game with a new seed and the currently seated players; 'Back to menu' reopens the game menu for the VIP, reusing the existing menu 'start' action. Updated e2e/games/quick-draw.spec.ts to assert the results screen (winner headline, VIP-only actions, other player's placement) instead of a return to the lobby, per the story brief superseding CC-1.15 criterion 5. Added unit tests for standings/ties/headline/VIP-gating/next-game routing (apps/host/test/results/results.test.ts, apps/controller/test/results/results-view.test.ts) and extended the host runtime and controller state tests. Reviewed by dipsaus-ai:story-reviewer: pass, no blocking findings, two advisory notes recorded in the task's notes.
<!-- SECTION:FINAL_SUMMARY:END -->
