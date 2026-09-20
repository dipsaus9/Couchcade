---
id: CC-3.27
title: Let the VIP or host end a running game early
status: To Do
assignee: []
created_date: '2026-09-19 08:25'
updated_date: '2026-09-20 10:06'
labels:
  - story
dependencies: []
references:
  - packages/protocol/src/messages/index.ts
  - apps/server/src/room/moderation.ts
  - apps/server/src/room/room.ts
  - apps/host/src/runtime/host-runtime.ts
  - apps/host/src/App.vue
  - apps/host/src/session/use-host-session.ts
  - apps/controller/src/runtime/GameController.vue
  - apps/controller/src/runtime/send.ts
  - apps/host/test/runtime/host-runtime.test.ts
  - apps/controller/test/runtime/send.test.ts
  - apps/server/test/room.test.ts
  - apps/server/test/moderation.test.ts
parent_task_id: CC-3
type: feature
ordinal: 233000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Outcome: the VIP (or the host, on the TV) can stop a running game before it finishes and return to the menu, instead of every game having to run to completion.

Type: deliverable
Branch: CC-3.27/end-game-early

Reported during the CC-3.24 owner replay (2026-09-19): "I'm missing buttons to end the game early if I want to." No such control exists today on either apps/host or apps/controller.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A control on the TV (host) and/or the VIP's phone lets them end the running game early
- [ ] #2 Ending early returns every phone and the TV to the menu/lobby cleanly, with no stuck state
- [ ] #3 A moderation-style guard (only the VIP or host can trigger it) is in place, consistent with existing kick/lock controls
<!-- AC:END -->
