---
id: CC-1.17
title: Set up the Playwright multi-device E2E harness in CI
status: Done
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 21:00'
labels:
  - story
dependencies:
  - CC-1.6
  - CC-1.11
  - CC-1.12
references:
  - e2e/
  - playwright.config.ts
  - .github/workflows/e2e.yml
parent_task_id: CC-1
priority: high
type: chore
ordinal: 40000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Tests can drive one host and several phones against the local dev server, in CI.

Type: deliverable
Branch: CC-1.17/e2e-harness
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A fixture launches one host context and N phone contexts against the local dev server
- [x] #2 A sensor adapter injection hook is documented for motion tests
- [x] #3 A smoke test where the host creates a room and 2 phones join passes on Chromium and WebKit
- [x] #4 .github/workflows/e2e.yml runs the suite on pull requests and uploads traces only on failure (7-day retention)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. New workspace package e2e/ (@couchcade/e2e): playwright.config.ts lives in e2e/ (root playwright.config.ts Reference unused: @playwright/test is only installed in e2e). webServer runs pnpm dev on :5173, global setup waits for /host/ and /. Config creates apps/server/.dev.vars from the example when missing.
2. src/fixtures.ts: host (TV context 1920x1080 at /host/) and phones(n, {motion}) (one context per phone, iPhone 15 on WebKit, Pixel 7 on Chromium). src/flows.ts: openRoom types the example passcode, joinRoom, trackRelaySockets.
3. src/motion.ts + README: window.__couchcadeMotion hook via addInitScript, contract for apps/controller/src/motion/adapter.ts (CC-5.10), pushMotionSample/playMotionTrace helpers; platform/motion-hook.spec.ts checks the harness half.
4. platform/smoke.spec.ts: host opens a room, 2 phones join, host ends room, phones leave and sockets close (CC-1.11 note).
5. .github/workflows/e2e.yml on pull_request: pnpm store + browser cache keyed on Playwright version, install-deps, pnpm e2e, traces uploaded on failure for 7 days. Not a required check.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm e2e

Review gate (story-reviewer, round 1): pass. All 4 criteria met, no scope violations, no findings. pnpm-lock.yaml and the task file were excluded from the reviewed diff on purpose.
Root playwright.config.ts Reference is not used: @playwright/test is only installed in the e2e package, so the config lives at e2e/playwright.config.ts.
CC-1.11 socket note: measured locally, both phone relay sockets close 45-60 ms after End room on Chromium and WebKit, and the phone leave screen shows within ~100 ms. The smoke test now asserts each phone socket closes within 2 s of its room-closed screen.
Follow-up for CC-2.3: RL_CREATE (3 rooms per IP per minute) will trip once several specs create rooms in one run; CC-2.3 needs a dev/E2E allowance or specs must share rooms.

CI on PR #53: e2e job green in 1m27s with a cold browser cache (4 passed in 17.7s, cache saved as playwright-Linux-1.63.0-chromium-webkit); check, check:style, check:deps, test, build green.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added the e2e workspace package: Playwright config in e2e/ (the root playwright.config.ts Reference is unused because @playwright/test lives only in e2e), host and phones(n) fixtures with one browser context per device against pnpm dev on :5173, shared openRoom/joinRoom steps that type the example test passcode into the real form, and .dev.vars creation from the example when missing. The window.__couchcadeMotion fake sensor adapter hook is implemented on the harness side and documented in e2e/README.md for CC-5.10. A smoke test (host opens a room, two phones join, room ends, phone sockets close within 2 s) and a motion hook test pass on Chromium and WebKit. .github/workflows/e2e.yml runs on pull requests with pnpm and browser caches and uploads traces only on failure for 7 days; it is not a required check.
<!-- SECTION:FINAL_SUMMARY:END -->
