---
id: CC-3.28
title: Give the controller a VIP signal during a running game
status: Done
assignee: []
created_date: '2026-09-20 10:28'
updated_date: '2026-09-20 12:00'
labels:
  - story
dependencies: []
references:
  - apps/controller/src/session/state.ts
  - apps/host/src/runtime/view-sync.ts
  - apps/controller/src/runtime/GameController.vue
  - apps/host/src/runtime/host-runtime.ts
  - packages/protocol/src/shared/index.ts
  - apps/controller/test/state.test.ts
  - apps/host/test/runtime/view-sync.test.ts
  - packages/protocol/test/shared.test.ts
parent_task_id: CC-3
type: feature
ordinal: 236000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Outcome: the VIP-only "End game" control on a phone (CC-3.27) is shown only to the current VIP, instead of every seated player, so a non-VIP never sees a button that silently does nothing.

Type: deliverable
Branch: CC-3.28/vip-signal-during-play

CC-3.27 gated its "End game" action host-side to the current VIP (host-runtime.ts checks `from === vip(state)?.id`), because the controller has no client-side signal for who the current VIP is once a game is running -- lobby, menu and results views each carry an explicit `vip` flag from the host, but the running game's own view is entirely game-controlled data (`apps/controller/src/runtime/GameController.vue`'s `bound` props come straight from the game's own `view()` function), and there's no platform-level channel for VIP status during play. The workaround shipped in CC-3.27: show the "End game" button to every seated player and let the host-side guard silently ignore a non-VIP's tap. That's correct but confusing UX -- a non-VIP taps a live-looking button and nothing happens, with no explanation.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The controller can tell, during a running game, whether the current phone is the VIP (e.g. a lightweight vip flag delivered alongside the running game's view, independent of each game's own view data)
- [x] #2 CC-3.27's "End game" control (and any future VIP-only in-game control) is shown only to the current VIP's phone; other seated players in the running game don't see it
- [x] #3 The signal updates correctly if the VIP changes mid-game (e.g. the previous VIP disconnects and VIP passes to the next connected player)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Add an optional platform-owned `vip` field to controllerViewSchema (packages/protocol/src/shared/
index.ts), sibling to `data` so a game's own view() never sees or sets it (controllerProps in
apps/controller/src/runtime/controller.ts only forwards screen+data to the game component).
host-runtime.ts gains a `withVip(gameViews)` helper that stamps `vip: id === currentLeaderId` on
every per-player running-game view just before it's sent (both the initial show() in start() and
every loop tick), recomputed from `lobby` each time so it follows a VIP who disconnects mid-game
(lobby-state.ts's vip() already picks the next connected seated player). No apps/server change is
needed: the relay forwards `view` opaquely already (confirmed via apps/server/src/room/room.ts and
views.ts). apps/controller/src/session/state.ts gets a small isVipInGame(state) reader (mirrors
menu-view.ts's isVipLobby), and GameController.vue gates the CC-3.27 "End game" button on it.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Collision note: bun backlog-workflow.ts collisions CC-3.28 flagged CC-5.11 (References:
apps/controller/test/) as a directory-prefix overlap with this story's apps/controller/test/
state.test.ts. Verified safe to proceed: CC-5.11 has no live branch anywhere (git branch/ls-remote/
worktree all empty) and its own dependency CC-5.14 is still To Do, so CC-5.11 isn't even pickable
yet -- a false positive from directory-level References granularity, not a real concurrent-delivery
conflict.

Reviewer (sonnet, round 1): pass. All 3 acceptance criteria met, no scope violations, no findings. Ran controller/host/protocol test suites independently (203+289+126 tests, all green).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added an optional platform-owned `vip` field to controllerViewSchema (packages/protocol), a
sibling of a running game's own `data` so no game ever sees or sets it. host-runtime.ts's new
withVip() stamps `vip: id === currentLeaderId` on every per-player running-game view, recomputed
from the lobby on every send so it follows the VIP if they disconnect mid-game. Controller session
state gets a small isVipInGame(state) reader (mirrors the existing isVipLobby pattern), and
GameController.vue now shows CC-3.27's "End game" control only to the current VIP's phone instead
of every seated player. Reviewer (sonnet): pass, no findings.
<!-- SECTION:FINAL_SUMMARY:END -->
