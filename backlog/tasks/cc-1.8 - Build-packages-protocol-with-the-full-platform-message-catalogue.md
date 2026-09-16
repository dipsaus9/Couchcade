---
id: CC-1.8
title: Build packages/protocol with the full platform message catalogue
status: In Progress
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 15:52'
labels:
  - story
dependencies:
  - CC-1.1
  - CC-1.5
references:
  - packages/protocol/
parent_task_id: CC-1
priority: high
type: feature
ordinal: 31000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Typed, validated schemas for every platform message, so later stories never need to edit the protocol package.

Type: deliverable
Branch: CC-1.8/protocol-package
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 zod/mini schemas exist for every message in the catalogue of docs/architecture/platform.md, including presence, input, controller:state, moderation, snapshot, reconnect, player profile (Pip parts), clock ping/pong and calibration
- [ ] #2 encode() rejects any message larger than 1 KB
- [ ] #3 Each message has a valid and an invalid fixture test
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Scaffold packages/protocol: package.json with '.' and './*' wildcard exports to TS source, zod from the catalog, tsconfig extending @couchcade/config/tsconfig/lib.json, vitest config from @couchcade/config/vite.
2. src/shared: room code, player id, game id, room time, slot, JsonValue, PipProfile (HOUSE_STYLE part counts), PlayerInfo, ControllerView, cue tokens, platform screens, RoomPhase, Role.
3. src/messages: every catalogue payload plus per-direction catalogues (host->relay, phone->relay, relay->host with required from, relay->phone), discriminated unions, Envelope/MessageType/PayloadOf types, senders map and canSend.
4. src/codec: encode (throws over 1024 UTF-8 bytes), decode (size check before parse, returns a result with a reason), protocolVersion, keepAlive.
5. src/close-codes and src/api (HTTP bodies and error body).
6. Tests: valid and invalid fixture per message per direction with encode/decode round trips, catalogue completeness, codec size edges, API bodies.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test
<!-- SECTION:NOTES:END -->
