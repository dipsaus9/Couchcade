---
id: CC-1.18
title: Add the deploy workflow with a live smoke test
status: In Progress
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 20:51'
labels:
  - story
  - needs-info
dependencies:
  - CC-1.6
  - CC-1.10
  - CC-1.11
  - CC-1.12
references:
  - .github/workflows/deploy.yml
  - tooling/smoke/
  - apps/server/wrangler.jsonc
  - apps/server/package.json
  - apps/server/src/worker.ts
  - apps/server/test/worker.test.ts
parent_task_id: CC-1
priority: high
type: chore
ordinal: 41000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Every merge to main deploys to workers.dev and proves a room can be created.

Type: deliverable
Branch: CC-1.18/deploy-workflow
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 .github/workflows/deploy.yml runs on push to main after CI succeeds and deploys with cloudflare/wrangler-action
- [x] #2 tooling/smoke/ creates a room with the passcode through the API and opens a WebSocket
- [x] #3 A failing smoke test fails the workflow
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. apps/server: build script assembles apps/controller/dist into dist/public and apps/host/dist into dist/public/host; host and controller become workspace devDependencies so pnpm -r build orders them first. wrangler.jsonc gets assets { directory ./dist/public, not_found_handling single-page-application, run_worker_first [/api/*, /ws/*] }. Check vitest pool and pnpm dev still work.
2. tooling/smoke (@couchcade/smoke): POST /api/rooms with the passcode, open /ws/CODE?ticket&v=1 with Origin = site, wait for room:welcome, send room:end, expect close 4004. Also GET / and /host/ return 200 HTML. Exit 1 on any failure. Unit tests with injected fetch/WebSocket; local run against pnpm dev.
3. .github/workflows/deploy.yml: workflow_run on CI completed for main (push, success), job gate that skips when CLOUDFLARE_API_TOKEN/ACCOUNT_ID are unset, skip when head_sha is no longer main's tip, install, build, cloudflare/wrangler-action@SHA (v4.0.0) deploy from apps/server, then smoke with SMOKE_HOST_PASSCODE against https://couchcade.dipsaus9.workers.dev.
4. Owner steps in PR body. No deploy from here.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Needs owner action: first manual `pnpm run deploy`, Worker secrets set, GitHub secrets CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, SMOKE_HOST_PASSCODE. Remove needs-info once confirmed.

Delivery (2026-09-16): References amended to add apps/server/wrangler.jsonc and apps/server/package.json (assets config and build step, per CC-1.9 notes) and apps/server/src/worker.ts plus test/worker.test.ts: workerd refused to start the bundled Worker because worker.ts exported the string roomLocationHint ('Incorrect type for map entry'); Vite dev doesn't check this, so the first real deploy would have failed. This collides with CC-2.7 (To Do) on worker.ts.
Evidence: smoke passed against pnpm dev and against wrangler dev --local on the built bundle (/, /host/, create room, room:welcome, room:end closes 4004); wrong passcode exits 1 with a hint. wrangler deploy --dry-run: 10 assets, 129 KiB / 30 KiB gzip. actionlint 1.7.12 clean. No deploy run (owner gate).
Open for CC-2.2: in production Turnstile will reject the dummy token, so the smoke can't create a room after CC-2.2. security.md defines no bypass, none added. Recommended: CC-2.2 amends security.md with a SMOKE_TOKEN Worker secret whose constant-time match on an x-cc-smoke header skips only Turnstile on POST /api/rooms.
Review: story-reviewer verdict pass (round 1), all 3 criteria met, no scope violations, no findings.
AC 1 stays open until the first live Deploy run; the label needs-info stays until the owner confirms the secrets and first deploy.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added .github/workflows/deploy.yml (workflow_run on CI success for pushes to main; skips with a notice while CLOUDFLARE_API_TOKEN/CLOUDFLARE_ACCOUNT_ID are unset or when the commit is no longer main's tip; builds, deploys apps/server with cloudflare/wrangler-action v4.0.0 pinned by SHA, then runs the smoke test against https://couchcade.dipsaus9.workers.dev with SMOKE_HOST_PASSCODE). Added tooling/smoke (@couchcade/smoke): loads / and /host/, creates a room with the passcode, opens the host socket with Origin, waits for room:welcome, ends the room (4004), exits 1 on any failure. apps/server now builds dist/public from the controller and host dists and serves it as static assets with only /api/* and /ws/* running the Worker. Fixed a non-handler export in worker.ts that made workerd refuse the bundled Worker. Awaiting the owner's secrets and first deploy.
<!-- SECTION:FINAL_SUMMARY:END -->
