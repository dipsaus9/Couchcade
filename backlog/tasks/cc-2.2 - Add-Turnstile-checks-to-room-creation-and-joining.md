---
id: CC-2.2
title: Add Turnstile checks to room creation and joining
status: In Progress
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-17 10:25'
labels:
  - story
dependencies:
  - CC-2.1
  - CC-1.10
  - CC-1.11
  - CC-1.12
references:
  - apps/server/src/security/turnstile.ts
  - apps/server/src/api/
  - apps/server/src/worker.ts
  - apps/server/vitest.config.ts
  - apps/server/test/turnstile.test.ts
  - apps/server/test/siteverify.ts
  - apps/server/test/api.test.ts
  - apps/server/test/rate-limits.test.ts
  - apps/host/src/security/
  - apps/host/src/net/api.ts
  - apps/host/src/session/use-host-session.ts
  - apps/host/test/turnstile.test.ts
  - apps/controller/src/security/
  - apps/controller/src/join/
  - apps/controller/src/App.vue
  - apps/controller/test/turnstile.test.ts
  - apps/controller/test/api.test.ts
  - tooling/smoke/
  - .github/workflows/deploy.yml
  - docs/architecture/security.md
parent_task_id: CC-2
type: feature
ordinal: 44000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Bots can't create or join rooms.

Type: deliverable
Branch: CC-2.2/turnstile-checks
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The API returns 403 for a missing or invalid Turnstile token
- [x] #2 Host and controller render the invisible widget and use Cloudflare test keys in development
- [x] #3 Tests use the dummy token XXXX.DUMMY.TOKEN.XXXX
- [x] #4 POST /api/rooms with an x-cc-smoke header matching the SMOKE_TOKEN Worker secret (constant-time compare) skips only Turnstile; Origin, rate limits and the passcode still apply, and a wrong or missing smoke token falls back to the normal Turnstile check (security.md decision 19)
- [x] #5 tooling/smoke sends x-cc-smoke from a SMOKE_TOKEN env var and .github/workflows/deploy.yml passes it from the SMOKE_TOKEN GitHub secret, so the live smoke test still creates a room once Turnstile is on
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Server: apps/server/src/security/turnstile.ts calls Siteverify once (3 s timeout, fail closed to 403 turnstile-unavailable), requires success, and checks action + hostname unless a Cloudflare test secret (1x0000/2x0000/3x0000) is set. Missing/invalid token -> 403 turnstile-failed. Smoke bypass: x-cc-smoke vs SMOKE_TOKEN via SHA-256 + timingSafeEqual, POST /api/rooms only, step 3 only. A missing turnstile field reaches step 3 (403), not 400.
2. Body cap: real Turnstile tokens can be up to 2048 characters, so API bodies are capped at 4 KB (flagged for the owner; security.md check order updated).
3. Tests: vitest setup stubs Siteverify with Cloudflare's documented test-secret behaviour (1x passes, 2x fails, 3x timeout-or-duplicate), test secret 1x + dummy token XXXX.DUMMY.TOKEN.XXXX; unit tests for action/hostname with an injected fetch; API tests for 403 before passcode, smoke bypass (match, wrong, missing, join ignores it, rate limit + passcode still apply).
4. Apps: src/security/turnstile.ts in host and controller: explicit render of an Invisible widget with execution execute, run on submit, reset before every run and after a 403. Site key from VITE_TURNSTILE_SITE_KEY, else Cloudflare's invisible test key 1x00000000000000000000BB. Wire into host createRoom and controller createPhoneSession.
5. tooling/smoke sends x-cc-smoke from SMOKE_TOKEN; deploy.yml passes secrets.SMOKE_TOKEN and vars.TURNSTILE_SITE_KEY (as VITE_TURNSTILE_SITE_KEY for pnpm build) and fails before deploying when either is missing.
6. security.md: check order step 3 mentions the smoke bypass, owner checklist gets exact commands.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test

Amended 2026-09-17 (owner decision: smoke token, security.md decision 19). Owner actions to write as steps: create the Turnstile widget (Invisible, hostname couchcade.dipsaus9.workers.dev) and set TURNSTILE_SECRET_KEY as a Worker SECRET; generate SMOKE_TOKEN (openssl rand -base64 32) and set it both as a Worker secret and as a GitHub Actions secret. Deploy order: secrets first, then merge.

Delivery notes (2026-09-17):
- Siteverify checked against the live endpoint: test secret 1x0000 passes any non-empty token with hostname example.com and no action; 2x0000 answers invalid-input-response; 3x0000 timeout-or-duplicate. apps/server/test/siteverify.ts models exactly that, so Worker tests need no network.
- New 403 code turnstile-failed (missing/invalid/mismatched token); turnstile-unavailable stays for an unset secret or a Siteverify error/timeout (fail closed).
- API body cap raised from 1 KB to 4 KB: Cloudflare documents tokens up to 2,048 characters, so a real token could get 400 under 1 KB. Documented in security.md check order; flagged for the owner.
- Site key: VITE_TURNSTILE_SITE_KEY at build time (deploy.yml sets it from the TURNSTILE_SITE_KEY Actions variable), else Cloudflare's invisible test key 1x00000000000000000000BB.
- deploy.yml stops before wrangler deploy while the TURNSTILE_SITE_KEY variable, the SMOKE_TOKEN Actions secret, or the TURNSTILE_SECRET_KEY / SMOKE_TOKEN Worker secrets (wrangler secret list, names only) are missing.
- Local E2E (CI=1 pnpm e2e): 14 passed on Chromium and WebKit with the real Turnstile script and test keys.

Review gate (dipsaus-ai:story-reviewer, round 1): pass. All 5 criteria met, no scope violations, no findings. Status left In Progress: merging turns Turnstile on for every deploy, so the owner sets up the widget, TURNSTILE_SECRET_KEY, SMOKE_TOKEN and the TURNSTILE_SITE_KEY variable first.
<!-- SECTION:NOTES:END -->
