---
id: CC-2.5
title: Add per-socket flood protection and reconnect token revocation
status: Done
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-17 09:09'
labels:
  - story
dependencies:
  - CC-2.1
  - CC-3.4
references:
  - apps/server/src/room/flood.ts
  - apps/server/src/room/room.ts
  - apps/server/src/room/storage.ts
  - apps/server/src/room/sockets.ts
  - apps/server/test/flood.test.ts
  - docs/architecture/platform.md
parent_task_id: CC-2
type: feature
ordinal: 47000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A misbehaving client can't burn the request budget.

Type: deliverable
Branch: CC-2.5/socket-flood-protection
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Each socket has a token bucket of 20 messages/s with burst 40
- [x] #2 Violators are disconnected and their reconnect token is revoked
- [x] #3 A test floods a socket and asserts disconnect and revocation
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. apps/server/src/room/flood.ts: pure token bucket (20/s, burst 40) stored as { tokens, at } in socket state; refill computed from the time since the last frame, no timer, O(1).
2. sockets.ts: bucket field on host and phone socket state. room.ts onMessage takes a token for every frame that reaches the handler (before size/JSON/schema/role drops) and writes it back with one setState (merged with the lastActiveAt touch). No storage write per message.
3. Violation: close 4008. Phone: players.revoked = 1 and the seat released in one UPDATE, host gets player:left kicked. Host: meta.host_revoked = 1 (lazy ALTER TABLE like released; platform.md Room storage row amended), phones get room:host connected:false through the normal close path.
4. Revocation is checked by the room on connect, per security.md 'Check order' (/rejoin stays a no-room-call token swap): a revoked player or host closes with 4008 before the seat checks. No change to apps/server/src/api or security/tickets.ts.
5. Tests (apps/server/test/flood.test.ts, @cloudflare/vitest-plugin): pure bucket tests incl. an honest phone at 4 inputs/s plus clock bursts/resyncs and a host at 1.5 states/s never throttled; flood a phone and the host with a frozen clock, assert 4008, one player:left kicked, revoked row, and that a signed rejoin token -> /rejoin -> /ws closes with 4008; an in-room honest phone over simulated minutes stays open.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test

Built: apps/server/src/room/flood.ts (pure bucket { tokens, at }, refill from elapsed time, no timer). room.ts onMessage takes a token for every frame before any drop (oversized, bad JSON, binary, role) and writes it back with setState (serializeAttachment, no storage write). Violation: phone -> players.revoked=1 + released in one UPDATE, host gets player:left kicked, close 4008; host -> meta.host_revoked=1 (lazy ALTER TABLE like released; platform.md Room storage meta row amended), close 4008. Frames queued behind the close are ignored (readyState check) so the violation is handled once. Revocation is checked by the room on connect (revoked player or host -> 4008, before the seat checks), per security.md Check order: /rejoin keeps swapping the token without a room call, the /ws socket then closes 4008. No change to apps/server/src/api or security/tickets.ts. References amended: storage.ts, sockets.ts, test/flood.test.ts, platform.md. Tests: vi.useFakeTimers({ toFake: ['Date'] }) freezes room time inside the Durable Object in the vitest pool, so flood tests are exact. Verify: pnpm check, check:style, check:deps, test, build green.

Review (story-reviewer, round 1): pass. All 3 criteria met, no scope violations, no findings.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Every room socket, the host's included, now has a token bucket of 20 messages per second with a burst of 40, kept in socket state (apps/server/src/room/flood.ts) so it survives hibernation with no timer and no storage write per message. Every frame that reaches the handler takes a token, including frames the relay drops. A socket that empties the bucket is closed with 4008 and revoked: a player's row gets revoked with the seat released and the host receives player:left kicked; a flooding host sets meta.host_revoked (lazy column migration, platform.md Room storage row amended). The room refuses revoked players and a revoked host on connect with 4008, so a rejoin token swapped at /rejoin (still no room call, per security.md) opens a socket that closes at once. apps/server/test/flood.test.ts floods phone and host sockets and asserts 4008, one player:left, the revoked flags, a refused rejoin through the real /rejoin and /ws path, a bucket that survives a woken room, and that an honest phone at 4 inputs/s with clock pings (and a host at 1.5 states/s) is never throttled.
<!-- SECTION:FINAL_SUMMARY:END -->
