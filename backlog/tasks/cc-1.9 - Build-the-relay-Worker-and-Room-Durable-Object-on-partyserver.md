---
id: CC-1.9
title: Build the relay Worker and Room Durable Object on partyserver
status: Done
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 16:26'
labels:
  - story
dependencies:
  - CC-1.1
  - CC-1.3
  - CC-1.7
  - CC-1.8
references:
  - apps/server/package.json
  - apps/server/wrangler.jsonc
  - apps/server/src/worker.ts
  - apps/server/src/room/
  - apps/server/test/
parent_task_id: CC-1
priority: high
type: feature
ordinal: 32000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A hibernating room relay that forwards input from phones to the host and controller state from the host to phones.

Type: deliverable
Branch: CC-1.9/relay-room-object
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The Room Durable Object extends partyserver and accepts sockets with the Hibernation API
- [x] #2 Phone input is forwarded only to the host; host controller:state is forwarded only to the targeted phones
- [x] #3 player:joined and player:left are sent to the host
- [x] #4 The Durable Object uses no setTimeout or setInterval (grep check in test); idle rooms expire through an alarm after 30 minutes
- [x] #5 Rooms are created with locationHint "weur" and wrangler.jsonc declares the Durable Object and rate limit bindings
- [x] #6 Tests with @cloudflare/vitest-plugin cover join, forward and leave
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Scaffold @couchcade/server (package.json, tsconfig, wrangler.jsonc with Room DO + RL_* rate limit bindings + sampled observability with invocation logs off, vite.config.ts for dev, vitest.config.ts with @cloudflare/vitest-plugin).
2. src/worker.ts: createWorker({ verifyTicket }) routing /ws/:code (code format 404, upgrade 400, v 426, ticket 401) and roomStub() with locationHint weur; default export refuses all tickets until CC-1.10; strips x-cc-*/x-partykit-* headers and _pk.
3. src/room/: Room extends partyserver Server with hibernate:true, auto-response ping/pong, tags host/phone, socket state for role/seat/activity, SQLite meta/players, /internal/create + /internal/status, one alarm for waiting-for-host/host-away/idle/4h deadlines, forwarding per platform.md message rules via @couchcade/protocol.
4. Tests: join, forward, leave, lifecycle alarms, worker routing, no-timers grep.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test

Split with CC-1.10 (tickets, HTTP API): src/worker.ts exports createWorker({ verifyTicket }) and type TicketVerifier = (ticket, code, env) => Promise<SocketIdentity | null>. The default export uses refuseAllTickets, so every /ws upgrade gets 401 until CC-1.10 swaps in the HMAC verifier. The Worker already checks code format (404), upgrade (400) and v (426), strips x-cc-* and x-partykit-* headers, drops the _pk query param (partyserver uses it as connection id and tag), and sets x-cc-role, x-cc-player-id (host = 'host') and percent-encoded x-cc-name. Hook comments mark where CC-1.10 adds the Origin check (403) and CC-2.3 the RL_UPGRADE limit (429). roomStub(env, code) always uses locationHint weur; CC-1.10 should reuse it for /internal/create (POST, 201 or 409 room-active) and /internal/status (GET, 200 { state: waiting-for-host|live|host-away, locked, phones } or 404), both implemented in the room.
Hook points left for later stories, as comments in src/room/room.ts: CC-2.5 flood bucket at the top of onMessage and revoked check on connect; CC-2.6 room:kick/room:lock and kicked check; CC-3.4 seat window, player:reconnected and expired (today a closed phone frees its seat at once and the host gets player:left disconnected); CC-3.5 room:snapshot and the snapshot table; CC-3.10 audience cap and promotion (today the 9th+ phone joins as audience with slot null).
Relay also handles clock:ping -> clock:pong (t1 = Date.now()), player:profile (stored and forwarded with from), player:leave (player:left left, close 1000), room:phase (stored, sent in welcome) and room:end (close 4004, delete storage), because no later story owns room.ts for those.
Tests: @cloudflare/vitest-plugin 1.1.9 with maxWorkers 1 and isolate false, 58 tests. evictDurableObject times out ('still has active references') while the test holds client sockets, so the hibernation test instead builds a fresh Room instance on the same DurableObjectState and hands it a frame from the hibernated socket. Idle expiry is tested by moving stored times and socket lastActiveAt back, then runDurableObjectAlarm. No-timers grep uses import.meta.glob ?raw over src/room/**.
Dev: vite.config.ts runs @cloudflare/vite-plugin; smoke-tested that /api/* reaches the Worker (404). Refused upgrades show as dropped sockets on the dev server (CC-1.3 gotcha 3). wrangler deploy --dry-run bundles 116 KiB / 26.75 KiB gzip with all six bindings. No build script yet (CC-1.18 assembles dist/public and assets config); package deploy script exists but was not run.

Review gate round 1 (dipsaus-ai:story-reviewer): verdict pass. AC1-6 met, no scope violations. Advisory: tsconfig.json, vite.config.ts and vitest.config.ts sit outside References as implied package scaffolding (approved up front); list package config files in future server story References. Advisory: add a test for an invalid identity reaching the room; done (closes with 1008).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Shipped @couchcade/server: a Worker (src/worker.ts) that routes GET /ws/:code upgrades (code format 404, upgrade 400, protocol version 426, ticket 401 through a TicketVerifier that CC-1.10 fills in; refuse-all by default), strips x-cc-*/x-partykit-* headers and _pk, and forwards to the Room with locationHint weur via roomStub(). The Room (src/room/room.ts) extends partyserver with hibernate: true, auto-answers ping/pong, tags sockets host/phone, keeps role/seat/activity in socket state and meta/players in SQLite, seats phones 0-7 then audience, forwards phone input/ui:action/calibration:tap/motion:status/player:profile to the host with a relay-set from, splits host controller:state into one view per targeted phone, sends room:welcome, room:host, player:joined and player:left, answers clock:ping, stores room:phase, handles room:end, replaces duplicate sockets with 4009, and closes rooms (4004, storage deleted) through one alarm after 30 minutes without a host, 30 minutes idle or 4 hours. wrangler.jsonc declares the Room DO (SQLite migration), the five RL_* rate limit bindings and sampled observability with invocation logs off and query strings redacted. 59 @cloudflare/vitest-plugin tests cover join, forward, leave, lifecycle alarms, Worker routing and a no-timers grep. Nothing deployed.
<!-- SECTION:FINAL_SUMMARY:END -->
