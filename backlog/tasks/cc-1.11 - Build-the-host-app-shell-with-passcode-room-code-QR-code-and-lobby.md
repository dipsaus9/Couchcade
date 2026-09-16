---
id: CC-1.11
title: 'Build the host app shell with passcode, room code, QR code and lobby'
status: Done
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 16:55'
labels:
  - story
dependencies:
  - CC-1.8
  - CC-1.10
references:
  - apps/host/
parent_task_id: CC-1
priority: high
type: feature
ordinal: 34000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The TV can create a room, show how to join and list joined players live.

Type: deliverable
Branch: CC-1.11/host-app-shell
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The host enters the passcode and creates a room through the API
- [x] #2 The TV shows the 4-letter code and a QR code encoding the join URL with ?room=CODE
- [x] #3 The lobby lists joined player names live over a partysocket connection
- [x] #4 Phaser boots at 480×270 with integer scaling
- [x] #5 A unit test covers the join URL builder
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Scaffold apps/host (@couchcade/host): Vite + Vue for DOM screens, base /host/ on :5174 via defineAppConfig; deps protocol, theme, utils, game-sdk, partysocket, phaser, uqr (QR, MIT, zero deps; catalog).
2. Pure logic with unit tests: join URL builder (origin + /?room=CODE), lobby state reducer over relay->host messages (welcome resets, joined/left/reconnected/promoted/profile), seat slots with next shapes, integer zoom for 480x270.
3. Net: POST /api/rooms client (passcode in memory only, turnstile empty until CC-2.2), partysocket with basePath ws/CODE, async query (first ticket, then /rejoin), keep-alive ping 25 s, stop on 4xxx close codes; session in sessionStorage couchcade:session.
4. Screens: passcode (masked input), lobby (players left 4x2 cards with empty slot shapes, QR + code tiles + URL right, End room sends room:end), plain theme-token styling.
5. Phaser stage boot at 480x270, pixelArt, integer zoom recomputed on resize, Sky letterbox. Registry glob in src/runtime/games.ts.
6. Dev proxy: apps/server/vite.config.ts proxies /host/* to :5174 and other non-api/ws paths to :5175 (HTTP only). Prove end to end with a local .dev.vars; fallback per platform.md if not.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test

Dev proxy proven (the CC-1.3 gap): apps/server/vite.config.ts proxies ^/host(/|$) to :5174 and ^/(?!api/|ws/|host) to :5175 with Vite server.proxy (HTTP only). With pnpm dev and a local gitignored .dev.vars copied from .dev.vars.example: GET :5173/host/ 200 (host index via proxy), /host/src/main.ts 200, /api/rooms 405, POST /api/rooms with the example passcode 201 { code, ticket, rejoinToken }, wrong passcode 401. In Chrome at localhost:5173/host/ the host rejoined a room from its stored rejoin token (POST /rejoin 200), the host socket passed the Worker Origin check through :5173, the lobby showed code XNPB, QR and 0/8; two phones joined via /join + /ws from the same origin and the lobby updated live to 2/8 (Sam VIP, Noor Player 2); closing Noor showed Away; End room sent room:end, host got 4004 and returned to the passcode screen with the session cleared. / returns 502 until CC-1.12 adds the controller dev server. No fallback needed; platform.md unchanged. All dev servers stopped afterwards.
Phaser: canvas 480x270 with CSS 1920x1080 at a 2160x1246 viewport (x4), pixelArt, Scale.NONE with integerZoom() recomputed on resize. Phaser loads in its own chunk (1.37 MB / 358 KB gzip, Vite warns >500 kB; the custom Phaser build is a later budget story). App chunk 134 KB / 49 KB gzip.
Choices: Vue 3 for the DOM screens (passcode input, lobby) on a 1920x1080 frame scaled to the window, plain theme-token CSS until CC-4.7; QR via uqr 0.1.3 (MIT, no deps, catalog) rendered as one SVG path (no v-html); turnstile sent as empty string until CC-2.2; keep-alive ping every 25 s with reconnect after 10 s without pong; host stops reconnecting on 4003/4004/4008/4009/4011 or a 401 from /rejoin. The registry glob (apps/host/src/runtime/games.ts) is left to CC-1.15, which owns src/runtime/.
Not exercised by typing: the passcode was not typed into the browser field (agent credential-entry rule); the same createRoom call was proven with curl and the rest of the flow in the browser.
Observed relay detail (CC-1.9 scope, not changed): in local dev a phone socket opened in the same tab stayed OPEN for a few seconds after room:end closed the host with 4004; earlier phone sockets did close. Worth a look in CC-1.17 E2E.

Review gate round 1 (dipsaus-ai:story-reviewer): verdict pass. AC1-5 met, no scope violations, no findings. apps/server/vite.config.ts (dev proxy per platform.md) and the uqr catalog entry were declared as implied scope; pnpm-lock.yaml and the task file were excluded from the diff on purpose.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Shipped @couchcade/host, the TV app shell. The host types the passcode into a masked field and creates a room through POST /api/rooms (passcode kept in memory only); the rejoin token goes to sessionStorage (couchcade:session), so a refreshed TV rejoins without the passcode. A partysocket connection to /ws/CODE gets a fresh ticket from /rejoin before every reconnect, sends a keep-alive ping every 25 s and stops on 4xxx close codes. A pure lobby reducer turns relay messages into a live list (joined, away, reconnected, promoted, profile, VIP), shown as 8 seat cards with empty slots previewing their shapes, next to a join panel with a uqr QR code for /?room=CODE, the address and the 4-letter code. End room sends room:end. Phaser boots at 480x270 with pixelArt and integer zoom recomputed on resize, in a lazy chunk. Screens are plain Vue on theme CSS variables until CC-4.7. apps/server/vite.config.ts now proxies /host/* to :5174 and other non-API paths to :5175; proven end to end in Chrome through :5173 (room, rejoin, host socket past the Origin check, 2 phones listed live, away, End room -> 4004), so no fallback was needed. 34 unit tests (join URL, lobby state, zoom). Nothing deployed.
<!-- SECTION:FINAL_SUMMARY:END -->
