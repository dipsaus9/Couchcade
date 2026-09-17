---
id: CC-2.3
title: 'Rate-limit room creation, joins and passcode attempts'
status: Done
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-17 09:52'
labels:
  - story
dependencies:
  - CC-2.2
references:
  - apps/server/src/security/rate-limits.ts
  - apps/server/src/api/
  - apps/server/src/worker.ts
  - apps/server/test/
  - apps/server/vite.config.ts
parent_task_id: CC-2
type: feature
ordinal: 45000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Abuse is rejected in the Worker before a Durable Object is called.

Type: deliverable
Branch: CC-2.3/api-rate-limits
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 More than 3 room creations per IP per minute return 429
- [x] #2 A test asserts the Durable Object is not invoked for rate-limited requests
- [x] #3 More than 20 join attempts per IP per minute return 429 (owner decision 2026-09-16: every phone at a party shares one Wi-Fi IP)
- [x] #4 More than 5 passcode attempts per IP per minute return 429 (every attempt counts, not only wrong ones, per docs/architecture/security.md)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. apps/server/src/security/rate-limits.ts: rateLimitKey(headers) (CF-Connecting-IP, IPv6 cut to its /64, a missing header falls into one shared 'unknown' bucket so nothing is ever unlimited) and isRateLimited(env, name, request) with a purpose prefix per binding.
2. Apply per security.md check order: POST /api/rooms RL_PASSCODE at step 1 and RL_CREATE at step 5; join RL_JOIN step 1; rejoin RL_REJOIN step 1; /ws RL_UPGRADE step 4 in worker.ts. All return 429 rate-limited before any room call.
3. Tests (vitest pool workers, real miniflare bindings from wrangler.jsonc): each limit lets N through and answers 429 to N+1 with watchRooms showing no room call; separate IPs have separate buckets; key tests. Test request helpers send a fresh CF-Connecting-IP so unrelated tests never share a bucket. Wait out the last seconds of a minute window before a burst, because miniflare's windows are wall-clock aligned.
4. pnpm dev / E2E: apps/server/vite.config.ts raises every RL_* limit only for 'vite serve' via the Cloudflare plugin's config customizer. Deploys use wrangler.jsonc directly, so production keeps its limits; no HTTP bypass exists.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test

Owner decisions 2026-09-16 (CC-2.1 security doc): join limit raised from 10 to 20 per IP per minute; the README's interactive challenge after 3 wrong codes is dropped. Per docs/architecture/security.md, the passcode limit counts every passcode attempt, not only wrong ones.

Scope amended 2026-09-17 by the delivering worker, on the orchestrator's instructions: the /ws upgrade limit (RL_UPGRADE, security.md step 4) lives in apps/server/src/worker.ts, the tests in apps/server/test/, and the dev-only limits that keep pnpm dev and the E2E suite working in apps/server/vite.config.ts. Dependency CC-2.2 (Turnstile) is not Done; the orchestrator dispatched this story anyway, and the rate limits don't need Turnstile: CC-2.2 slots into the documented step 3/4 of each endpoint.

Implementation (commit 9a3443c):
- apps/server/src/security/rate-limits.ts: clientKey() reads CF-Connecting-IP (IPv6 cut to its /64, IPv4-mapped IPv6 as the IPv4 address) and isRateLimited() calls the binding with key '<purpose>:<client>'. A missing header maps to one shared 'unknown' bucket: never unlimited. Production always sets the header; the Vite dev server (miniflare entry worker) sets it to the loopback address; unit tests pass it explicitly (test/helpers.ts clientHeaders() gives each request a fresh 10.x.y.z unless the test sets one).
- Check order per security.md: POST /api/rooms RL_PASSCODE at step 1 (counts every attempt, before the body is read) and RL_CREATE at step 5 (after the passcode); join RL_JOIN step 1; rejoin RL_REJOIN step 1; /ws RL_UPGRADE at step 4 in worker.ts (after upgrade/Origin/version, before the ticket). CC-1.10 had left all five as TODO comments; all are now applied. Turnstile (CC-2.2) still slots in at the documented step.
- Tests: test/rate-limits.test.ts uses the real miniflare Rate Limiting bindings from wrangler.jsonc (so it also proves the configured numbers): 3 creates then 429; 5 mixed passcode attempts (401, 400, 401, 201, 201) then 429 even with a correct passcode and for a malformed body; 20 joins then 429; 30 rejoins then 429; 30 upgrades then 429 for a valid ticket while another IP still connects (101); one IPv6 /64 shares a bucket. watchRooms() records every Room.idFromName call and each 429 asserts rooms: [] (AC2). Miniflare counts in wall-clock-aligned minute windows, so beforeEach waits out the last 10 s of a minute before a burst.

Dev/E2E decision (CC-1.17 known issue): apps/server/vite.config.ts sets every ratelimits[].simple.limit to 1000 through @cloudflare/vite-plugin's config() customizer (mutated in place, because a returned object is merged with defu, which concatenates arrays and would duplicate the bindings). vite.config.ts is only loaded by 'pnpm dev' (and so by E2E); the deploy runs 'wrangler deploy' on wrangler.jsonc, and vitest uses vitest.config.ts with wrangler.jsonc, so production and unit tests keep the security.md limits. No env var, header or code path turns limits off. Chosen over a wrangler env.dev block because ratelimits and durable_objects are non-inheritable, so env.dev would duplicate the whole binding list.
Evidence: pnpm dev probe with 8 wrong-passcode POSTs from one IP: with wrangler.jsonc limits 401x5 then 429x3; with the dev hook 401x8. CI=1 pnpm e2e: 12 passed (Chromium + WebKit) in 1.3m. pnpm check, check:style, check:deps, test (server 163 tests), build, budgets all green.

Review gate (dipsaus-ai:story-reviewer, round 1): pass. All 4 criteria met, no scope violations, no findings. The reviewer re-ran the rate-limit tests (10/10).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Every rate limit from docs/architecture/security.md now runs in the Worker before any Durable Object call and answers 429 { error: 'rate-limited' }: RL_PASSCODE (5/min, every POST /api/rooms, before the body is read), RL_CREATE (3/min, after the passcode), RL_JOIN (20/min), RL_REJOIN (30/min) and RL_UPGRADE (30/min, step 4 of /ws). apps/server/src/security/rate-limits.ts keys each limit by purpose plus CF-Connecting-IP (IPv6 cut to its /64; a missing header shares one bucket). test/rate-limits.test.ts drives the real miniflare bindings from wrangler.jsonc and asserts each limit answers 429 at the right count with no room addressed. pnpm dev (and so the E2E suite) raises every limit to 1000/min through the Cloudflare Vite plugin's config hook in vite.config.ts; deploys and unit tests read wrangler.jsonc unchanged and no bypass exists in the Worker. E2E stays green on Chromium and WebKit.
<!-- SECTION:FINAL_SUMMARY:END -->
