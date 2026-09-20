---
id: CC-3.28
title: Give the controller a VIP signal during a running game
status: To Do
assignee: []
created_date: '2026-09-20 10:28'
labels:
  - story
dependencies: []
references:
  - apps/controller/src/session/state.ts
  - apps/host/src/runtime/view-sync.ts
  - apps/controller/src/runtime/GameController.vue
  - apps/host/src/runtime/host-runtime.ts
  - apps/controller/test/state.test.ts
  - apps/host/test/runtime/view-sync.test.ts
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
- [ ] #1 The controller can tell, during a running game, whether the current phone is the VIP (e.g. a lightweight vip flag delivered alongside the running game's view, independent of each game's own view data)
- [ ] #2 CC-3.27's "End game" control (and any future VIP-only in-game control) is shown only to the current VIP's phone; other seated players in the running game don't see it
- [ ] #3 The signal updates correctly if the VIP changes mid-game (e.g. the previous VIP disconnects and VIP passes to the next connected player)
<!-- AC:END -->
