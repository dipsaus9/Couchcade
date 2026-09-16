---
id: CC-1.10
title: Add the room API with host passcode and signed join tickets
status: Done
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 16:39'
labels:
  - story
dependencies:
  - CC-1.9
references:
  - apps/server/src/api/
  - apps/server/src/security/tickets.ts
  - apps/server/src/worker.ts
  - apps/server/.dev.vars.example
parent_task_id: CC-1
priority: high
type: feature
ordinal: 33000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Only people with the host passcode can create rooms, and every WebSocket needs a short-lived signed ticket.

Type: deliverable
Branch: CC-1.10/rooms-api-passcode
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 POST /api/rooms returns 401 without the correct HOST_PASSCODE and otherwise returns a room code and a host ticket
- [x] #2 POST /api/rooms/:code/join returns a player ticket when the room exists and 404 otherwise
- [x] #3 WebSocket upgrades without a valid HMAC ticket (60 s expiry, bound to room and role) are rejected before the Durable Object is called
- [x] #4 apps/server/.dev.vars.example lists HOST_PASSCODE, TICKET_SIGNING_SECRET and TURNSTILE_SECRET_KEY with local test values
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. src/security/tickets.ts: HMAC-SHA-256 sign/verify for tickets (k ticket, 60 s exp in ms) and rejoin tokens (k rejoin, iat), base64url(JSON).base64url(sig), key imported once per isolate, secret under 32 chars refuses everything, any decode error returns null.
2. src/api/: errors (code list + errorResponse), body (JSON under 1 KB), passcode (SHA-256 both sides + crypto.subtle.timingSafeEqual, unset secret never matches), create (5 code attempts via /internal/create), join (code format 404, body 400, name length 400, /internal/status: not live 404, locked 423, 16 phones 409), rejoin (401 on any failure, no room call), router (405 wrong method, 404 unknown). Hook comments for CC-2.2 Turnstile, CC-2.3 rate limits, CC-2.4 names in documented order. Room access is injected, so api never imports worker.ts (import/no-cycle).
3. worker.ts: Env secrets, Origin check (403) on /ws, API routing, default export uses the HMAC verifier.
4. .dev.vars.example with the README test values.
5. Tests: test-only secrets via miniflare bindings in vitest.config.ts; tickets unit tests; API tests incl. no room call on rejection; ws tests with real tickets (no ticket, bad sig, expired, other room, rejoin token as ticket, wrong Origin, forged x-cc-role).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test

Delivery notes: API in src/api/ (index.ts router: route 404, foreign Origin 403, method 405, signing secret 500 not-configured, all before any room call; create.ts, join.ts, rejoin.ts follow the security.md check order with hook comments for CC-2.2 Turnstile, CC-2.3 rate limits and CC-2.4 names). Room access is injected through ApiContext so src/api never imports worker.ts (oxlint import/no-cycle). Error codes live in src/api/errors.ts as apiErrorStatus (code -> status). Recommendation: @couchcade/protocol should get an apiErrorCodes enum so the apps can map codes to copy type-safely (CC-9.4); not done here because protocol is outside References.
Tickets (src/security/tickets.ts): base64url(JSON).base64url(HMAC-SHA-256 over the first part); exp and iat in ms; host pid 'host' with empty name; key imported once per isolate; secrets under 32 characters refuse every token and signing throws. HOST_PASSCODE unset never matches. /ws now requires Origin equal to the request origin (a missing Origin is 403); the API only refuses a present foreign Origin, so non-browser clients (CC-1.18 smoke test) work without one, but the smoke test's socket must send Origin.
Join: name is trimmed and checked for 1 to 12 characters (name-not-allowed) until CC-2.4; profile is validated but not used yet (CC-6.5). 409 room-full at 16 open phone sockets from /internal/status; the room itself doesn't enforce the cap yet (CC-3.10).
Tests: test-only secrets through miniflare bindings in vitest.config.ts; 110 server tests incl. no-room-call assertions via a namespace spy. wrangler deploy --dry-run bundles 129 KiB / 30 KiB gzip. Nothing deployed.

Review gate round 1 (dipsaus-ai:story-reviewer): verdict pass. AC1-4 met, no scope violations, no findings. Tests under apps/server/test/ and vitest.config.ts were declared to the reviewer as implied test scaffolding.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Shipped the room API and signed tickets in @couchcade/server. POST /api/rooms checks HOST_PASSCODE with SHA-256 plus crypto.subtle.timingSafeEqual (unset passcode never matches) and creates a room through /internal/create with up to 5 codes, returning { code, ticket, rejoinToken }. POST /api/rooms/:code/join returns 404 for a malformed code without a room call, then asks /internal/status: 404 when missing or no TV, 423 locked, 409 room-full at 16 phones, else 200 { playerId, name, ticket, rejoinToken }. POST /api/rooms/:code/rejoin swaps a rejoin token for a fresh ticket without calling the room (401 otherwise). src/security/tickets.ts signs base64url(JSON).base64url(HMAC-SHA-256) tickets (k ticket, room, role, pid, name, 60 s exp) and rejoin tokens (k rejoin, iat) with TICKET_SIGNING_SECRET (under 32 characters refuses everything). The Worker's default export now verifies signed tickets and checks Origin (403) before any room call. Error codes are listed in src/api/errors.ts; hook comments mark CC-2.2 Turnstile, CC-2.3 rate limits and CC-2.4 names in the documented order. .dev.vars.example lists local test values. 110 server tests, including no-room-call assertions. Nothing deployed.
<!-- SECTION:FINAL_SUMMARY:END -->
