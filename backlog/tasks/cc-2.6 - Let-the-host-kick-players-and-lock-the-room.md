---
id: CC-2.6
title: Let the host kick players and lock the room
status: Done
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-17 09:34'
labels:
  - story
dependencies:
  - CC-2.5
  - CC-1.11
  - CC-1.12
references:
  - apps/server/src/room/moderation.ts
  - apps/server/src/room/room.ts
  - apps/host/src/screens/lobby/
  - apps/controller/src/screens/kicked/
  - apps/server/src/room/storage.ts
  - apps/server/test/moderation.test.ts
  - apps/host/package.json
  - apps/host/src/App.vue
  - apps/host/src/session/use-host-session.ts
  - apps/host/test/lobby-state.test.ts
  - apps/controller/src/App.vue
  - apps/controller/src/session/state.ts
  - apps/controller/src/session/session.ts
  - apps/controller/test/state.test.ts
  - apps/controller/test/api.test.ts
  - e2e/platform/moderation.spec.ts
parent_task_id: CC-2
type: feature
ordinal: 48000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The host stays in control of who plays.

Type: deliverable
Branch: CC-2.6/kick-and-lock
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The host lobby shows Kick per player and a Lock room toggle
- [x] #2 A kicked phone shows "Kicked" and can't rejoin that room
- [x] #3 New joins to a locked room get a referee-voice "Room is locked" message
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Server: apps/server/src/room/moderation.ts holds room:kick (one write: kicked+released, player:left kicked once, close every socket of that id with 4003), room:lock (write only on change) and the connect refusal (kicked 4003, then revoked 4008). storage.ts gains kicked, kickPlayer, setLocked; room.ts wires them into #onHostMessage and #connectPhone. Join API already answers 423. Tests in apps/server/test/moderation.test.ts.
2. Host: lobby card shows a 64 px Signal Kick button (CcButton small, stop) on hover/focus; header gets a Lock room toggle (aria-pressed). lobby-state gains setLocked; use-host-session sends room:kick / room:lock and applies the lock locally (the relay has no echo; room:welcome restores it). Host depends on @couchcade/ui. Unit tests in apps/host/test/lobby-state.test.ts.
3. Phone: apps/controller/src/screens/kicked/ KickedScreen (badge, 'Kicked', 'The host removed you from room CODE.', 'Join another room'); App shows it for an ended notice with reason kicked; a notice-dismissed event returns to an empty join form. Locked join copy already exists (423 -> 'Room is locked...'). Unit tests in apps/controller/test/state.test.ts.
4. e2e/platform/moderation.spec.ts: kick a phone from the TV lobby (phone shows Kicked), lock (join shows Room is locked), unlock (join works).
5. Amend References with the glue paths.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test

Built: apps/server/src/room/moderation.ts (kickPlayer: one UPDATE kicked+released, player:left kicked only when the seat was still held, every socket of the id closed with 4003; lockRoom writes only on change; refusalFor on connect: kicked 4003 before revoked 4008). storage.ts gains kicked, kickPlayer, setLocked (kicked column was in the original schema, no migration). Host: SeatCard shows a 64 px CcButton small stop Kick on card hover/focus (aria-label 'Kick <name>' bound as an object because strictTemplates rejects undeclared attrs); Lock room toggle (aria-pressed) plus a 'Room locked' tag; use-host-session sends room:kick/room:lock and applies the lock locally (no relay echo; room:welcome restores it); host now depends on @couchcade/ui. Phone: screens/kicked/KickedScreen.vue from the errors artboard; notice-dismissed event returns to an empty join form. 423 copy already existed ('Room is locked. Ask the host to unlock it, then try again.'). References amended with glue paths (storage.ts, tests, host package.json/App.vue/use-host-session.ts, controller App.vue/session, e2e spec). Verify: check, check:style, check:deps, test, build, budgets green; e2e moderation, smoke and rejoin specs pass on chromium and webkit locally.

Review (story-reviewer, round 1): pass. All 3 criteria met, no scope violations. Advisory: (1) kickPlayer needs a players row (audience phones get one on connect too, so they are kickable); (2) the TV applies Lock room before the relay has it (no echo in the protocol; the button is disabled while offline and room:welcome re-syncs).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The host now controls who plays. On the TV lobby, pointing at or focusing a player's card shows a 64 px Signal Kick button (CcButton small stop, from @couchcade/ui), and the header has a Lock room toggle (aria-pressed) with a Room locked tag. room:kick is handled in apps/server/src/room/moderation.ts: one write marks the player kicked and releases the seat, the host gets player:left kicked once, and every socket of that player closes with 4003. The room refuses kicked players on connect with 4003 (before the revoked 4008 check), so a rejoin token swapped at /rejoin opens a socket that closes at once. room:lock stores meta.locked (written only on change), /join answers 423 room-locked, seated players still rejoin, and a reconnecting host gets locked in room:welcome. The phone shows the approved Kicked screen (apps/controller/src/screens/kicked/) with Join another room, and a locked join shows 'Room is locked. Ask the host to unlock it, then try again.' Tests: apps/server/test/moderation.test.ts (close code, revocation, rejoin refused through the real /rejoin path, single player:left, away-player kick, 423 and unlock, rejoin while locked), host lobby-state and controller state/api unit tests, and e2e/platform/moderation.spec.ts (kick from the TV lobby, phone shows Kicked, lock blocks a join, unlock lets it in) on Chromium and WebKit.
<!-- SECTION:FINAL_SUMMARY:END -->
