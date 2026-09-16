---
id: CC-1.8
title: Build packages/protocol with the full platform message catalogue
status: Done
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 15:55'
labels:
  - story
dependencies:
  - CC-1.1
  - CC-1.5
references:
  - packages/protocol/
  - pnpm-lock.yaml
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
- [x] #1 zod/mini schemas exist for every message in the catalogue of docs/architecture/platform.md, including presence, input, controller:state, moderation, snapshot, reconnect, player profile (Pip parts), clock ping/pong and calibration
- [x] #2 encode() rejects any message larger than 1 KB
- [x] #3 Each message has a valid and an invalid fixture test
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

Doc readings and discrepancies (platform.md is binding, left unchanged):
- PipProfile part ranges (skin 6, hair 8, hairColour 6) come from HOUSE_STYLE and live in protocol as pipPartCounts, because @couchcade/utils Pip ranges (CC-6.2) do not exist yet. Follow-up: source them from utils once CC-6.1/CC-6.2 land.
- The doc says every timestamp is integer room time, but clock:ping/pong t0 is the sender's local clock (performance-based, fractional). t0 accepts any finite number; at, t1 and joinedAt are non-negative integers, so the CC-1.14/CC-1.16 send helper must round toHostTime().
- The name limit (1-12) counts UTF-16 code units. CC-2.4 may need grapheme-aware counting.
- API error codes are not enumerated in the doc; error is any non-empty string. Follow-up for CC-1.10 to list them in the doc.
- AC#1 'reconnect' is covered by player:reconnected and the rejoin API schemas; the doc has no separate reconnect message.
- Messages are grouped by direction (hostToRelay, phoneToRelay, relayToHost, relayToPhone) because room:welcome and controller:state change shape per direction. Relay-forwarded player messages require from; any from a client sends is stripped.

Review round 1: block, only for a scope violation: pnpm-lock.yaml sat outside References (all 3 ACs met). The lockfile change only adds the new package's importer and zod, and platform.md requires committing it. References amended to add pnpm-lock.yaml. No code change.

Review round 2: pass. All 3 ACs met, no scope violations, no findings.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added @couchcade/protocol (packages/protocol). It has zod/mini schemas for the whole platform.md catalogue, grouped by direction: host to relay, phone to relay, relay to host (forwarded player messages require from) and relay to phone. The shared types are room code, player id, game id, PipProfile with the HOUSE_STYLE part counts, PlayerInfo, ControllerView, RoomPhase and Role. The package also has a senders map with canSend for the relay's role check, encode (throws FrameTooLargeError over 1024 UTF-8 bytes), decode (checks size before parsing and returns a reason on failure), close codes, and HTTP API request, response and error schemas. It uses wildcard subpath exports to TS source and the config presets from packages/config. 97 unit tests cover a valid and an invalid fixture per message per direction with encode/decode round trips, catalogue completeness, codec size edges and API bodies.
<!-- SECTION:FINAL_SUMMARY:END -->
