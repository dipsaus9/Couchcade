---
id: CC-1
title: 'Epic: Platform foundations and playable skeleton'
status: To Do
assignee: []
created_date: '2026-09-16 12:23'
updated_date: '2026-09-16 12:23'
labels:
  - epic
dependencies: []
ordinal: 1000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Monorepo, relay, host and controller shells, game SDK contract, clock sync, CI and deploy, ending with the first playable game (Quick Draw, CC-10) on the live workers.dev site.

Chosen approach: build our own platform on Cloudflare Workers Free + Durable Objects, reusing partyserver (rooms on Durable Objects), partysocket (reconnecting WebSocket) and nipplejs (virtual joystick).
Rejected alternatives (research 2026-09-16):
- AirConsole: free tier is 2 players with ads, SDK is all rights reserved, games run in their iframe.
- Playroom Kit: closed source, free tier 10 users/day, no motion API.
- Rune: no shared TV screen, 4 players max.
- Colyseus: needs a second (Node) host outside the €0 Cloudflare plan.
- Build everything from scratch: more code to get right for rooms and reconnects than partyserver/partysocket.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The platform architecture doc (CC-1.1) is approved by the owner
- [ ] #2 On the live workers.dev site the owner can create a room with the host passcode and two phones can join by QR code or room code
- [ ] #3 CI (check, test, build, E2E) is green on main and merges to main deploy automatically
<!-- AC:END -->
