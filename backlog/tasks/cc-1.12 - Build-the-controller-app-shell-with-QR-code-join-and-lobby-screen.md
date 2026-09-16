---
id: CC-1.12
title: Build the controller app shell with QR/code join and lobby screen
status: Done
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 17:00'
labels:
  - story
dependencies:
  - CC-1.8
  - CC-1.10
references:
  - apps/controller/
parent_task_id: CC-1
priority: high
type: feature
ordinal: 35000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A phone can join a room by QR code or code, enter a name and wait in the lobby.

Type: deliverable
Branch: CC-1.12/controller-app-shell
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Opening /?room=CODE pre-fills the room code
- [x] #2 A name of 1–12 characters is required before joining
- [x] #3 The phone joins with a player ticket and shows a lobby screen with its name, colour and shape
- [x] #4 The layout is portrait and a screen wake lock is requested (errors ignored)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. apps/controller package (Vue 3.5, Vite, partysocket), base /, theme tokens as a build-time CSS virtual module.
2. Pure join logic: ?room= prefill via isRoomCode, code cleaning, name normalise + 1-12 check, API client for /join and /rejoin mapping error codes to referee copy.
3. Pure session reducer (join -> connecting -> room) + screenOf; sessionStorage couchcade:session; partysocket on /ws/CODE?ticket&v=1 with rejoin-per-reconnect, keep-alive ping, terminal close codes.
4. Screens: join, lobby (name, colour, shape), waiting; rotate notice; wake lock + portrait lock with errors ignored; Turnstile provider hook for CC-2.2.
5. Unit tests for form validation, API mapping, state logic, wake lock and storage. Local smoke against the server dev server.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test

Local smoke (2026-09-16): server dev server on :5183 plus the controller dev server on :5185 with a throwaway proxy config (CC-1.11 owns the real proxy), a scripted fake host and headless Chrome at 390x844. /?room=ktxw prefilled KTXW; Join disabled for a blank name and enabled for Sam; join returned a ticket, the socket connected and the lobby showed 'Sam | Player 1 | You're in, Sam | You're Cherry, the circle' with a Cherry fill; sessionStorage couchcade:session held code, playerId and rejoinToken; 1 wake lock request; reload rejoined the same seat through /rejoin; a wrong code showed the referee copy inline; landscape with a coarse pointer showed the rotate notice. Phone bundle: 43.8 KB gzip JS (budget 80 KB), 2.0 KB CSS.

Review gate round 1: pass. All 4 criteria met, no scope violations. Advisory: the name input's maxlength counted UTF-16 units and could cut a valid name before validation; fixed by dropping maxlength so checkName and the too-long hint enforce 12 characters.

After CC-1.11 merged: merged origin/main, then ran pnpm dev (server :5173 proxying /host/ to :5174 and everything else to :5175, the controller's dev port). In headless Chrome the host at :5173/host/ created room KJCW with the passcode, the phone at :5173/?room=KJCW had the code filled in, joined as Noor and showed 'Player 1, Cherry, the circle', and the host lobby listed Noor. All dev servers were stopped afterwards.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added apps/controller (@couchcade/controller), the Vue 3.5 phone app served at /. /?room=CODE fills in the code only when it is a valid room code. Join stays disabled until the name is 1 to 12 characters after normalising. Joining posts to /api/rooms/:code/join, keeps { code, playerId, rejoinToken } in sessionStorage under couchcade:session and connects through partysocket to /ws/CODE?ticket=...&v=1. Every reconnect gets a fresh ticket from /rejoin, a raw ping goes out every 25 s, and close codes 4003 to 4011 end the session. A pure reducer drives the join, connecting, lobby and waiting screens. The lobby shows the player's name, colour and shape, taken from their seat. API errors map to referee-voice copy. The layout is portrait with a rotate notice. The screen wake lock and portrait lock are requested with errors ignored. A TurnstileProvider hook is left for CC-2.2. Theme tokens are built into CSS at build time. Bundle: 43.8 KB gzip JS. 50 unit tests, plus a local headless-Chrome smoke against the server dev server.
<!-- SECTION:FINAL_SUMMARY:END -->
