---
id: CC-1.12
title: Build the controller app shell with QR/code join and lobby screen
status: In Progress
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 16:55'
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
<!-- SECTION:NOTES:END -->
