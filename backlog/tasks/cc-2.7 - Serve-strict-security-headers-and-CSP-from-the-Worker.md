---
id: CC-2.7
title: Serve strict security headers and CSP from the Worker
status: Done
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 21:34'
labels:
  - story
dependencies:
  - CC-2.1
  - CC-1.10
references:
  - apps/server/src/security/headers.ts
  - apps/server/src/worker.ts
  - apps/server/package.json
  - apps/server/scripts/write-headers-file.ts
  - apps/server/test/headers.test.ts
  - apps/host/vite.config.ts
  - apps/host/src/main.ts
parent_task_id: CC-2
type: feature
ordinal: 49000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Pages ship the README's security headers.

Type: deliverable
Branch: CC-2.7/security-headers
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 HTML and asset responses carry the CSP, HSTS, nosniff, Referrer-Policy, COOP and Permissions-Policy from the README
- [x] #2 The CSP allows challenges.cloudflare.com for Turnstile
- [x] #3 A test asserts every header
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. apps/server/src/security/headers.ts: single source for the README's 6 headers and the CSP (Turnstile challenges.cloudflare.com in script-src/frame-src, connect-src 'self'), plus withSecurityHeaders() for Worker responses and buildHeadersFile() for the Cloudflare _headers syntax.
2. apps/server/src/worker.ts: wrap every non-101 response from createWorker's fetch with withSecurityHeaders, covering /api/* (success and error) and /ws/* errors; skip the 101 upgrade (rebuilding a Response drops the webSocket pair).
3. apps/server/scripts/write-headers-file.ts + package.json build script: write dist/public/_headers from headers.ts at build time, so Cloudflare Static Assets applies it to HTML/asset responses without running the Worker.
4. apps/server/test/headers.test.ts: assert securityHeaders/CSP match the README exactly, assert the generated _headers file format, and assert real Worker responses (404, 400, 426, 401 invalid ticket, 201 create-room, 401 wrong passcode, 101 upgrade excluded) carry every header.
5. Prove it beyond unit tests: pnpm build the real bundle, wrangler dev --local against it, curl headers on / and /host/, and a headless-Chromium securitypolicyviolation listener on both pages (CC-2.7's own pre-deploy CSP check, since the CSP only applies to built output). Found and fixed a real bug this surfaced: apps/host/src/main.ts injected theme CSS via a runtime <style> element (violates style-src-elem); fixed by giving apps/host the same build-time virtual-CSS-module Vite plugin apps/controller already uses, so no CSP relaxation was needed. Also ran tooling/smoke end-to-end against the header-carrying server.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test

References amended: added apps/server/package.json (build script now runs scripts/write-headers-file.ts to emit dist/public/_headers), apps/server/scripts/write-headers-file.ts (new, generates the _headers file from headers.ts at build time), and apps/server/test/headers.test.ts (new test file). Needed because Cloudflare Static Assets reads _headers from the build output directory, which apps/server/package.json's build script assembles (CC-1.18).

References amended again: added README.md. Found via this story's own pre-deploy CSP check (security.md 'Headers' point 7: headless Chromium against the built bundle through wrangler dev --local): apps/host/src/App.vue's :style binding on .frame (TV-frame scaling, width/height/transform computed from window size) is blocked by a literal style-src 'self', because the computed style string differs per window size so no static hash could allow it. Fix: split the directive per CSP Level 3 — style-src 'self' stays (still blocks <style>/<link> injection via style-src-elem fallback), and style-src-attr 'unsafe-inline' is added to allow the style="..." attribute only. This is the one place the CSP differs from the literal text both docs called 'unchanged from the README' before this story; README.md's Security headers block and this note record the decision. security.md itself is unedited (it doesn't reprint the CSP verbatim, only apps/server/src/security/headers.ts does, per its own 'single source' rule), so there is no README/security.md disagreement, only a refinement neither doc anticipated. Verified with curl and a headless-Chromium console check against wrangler dev --local serving the real pnpm build output: no console errors or CSP violations on / or /host/ after the change.

Correction to the earlier note: the CSP was NOT relaxed. headers.ts and README.md are back to the exact README CSP (README.md ends up unedited; removed from References). Root cause of the pre-deploy CSP check's violation on /host/ (event: violatedDirective style-src-elem, blockedURI inline) was apps/host/src/main.ts injecting the theme tokens at runtime via document.createElement('style') + document.head.append — a genuine bug, not a CSP gap. apps/controller already solved this at build time with a Vite virtual module ('virtual:couchcade-theme.css', see its vite.config.ts comment: 'so ... the CSP needs no inline styles'); apps/host was missing that plugin. Fix: added the same themeCss() plugin to apps/host/vite.config.ts and switched main.ts to 'import "virtual:couchcade-theme.css"', matching apps/controller exactly. References amended: added apps/host/vite.config.ts and apps/host/src/main.ts, removed README.md (unedited). Note on the Vue :style binding on apps/host/src/App.vue's .frame element (TV-frame scaling): it never violated CSP in the first place — Chromium's securitypolicyviolation event only fired once, for style-src-elem (the injected <style> tag above), never for style-src-attr; Vue sets individual style properties via the CSSOM (el.style.prop = value), which browsers don't treat as the 'style' attribute CSP restricts, unlike el.style.cssText or setAttribute('style', ...). Re-verified after the fix: pnpm build (real host+controller+server build), wrangler dev --local serving the built dist/public, curl confirms every header on / and /host/, headless Chromium (Playwright chromium 153) with a securitypolicyviolation listener shows zero violations on either page, and tooling/smoke passed end-to-end (create room, open host socket, room:welcome, room:end) against that same server. Servers killed after verification; no scratch files committed.

Review: story-reviewer verdict pass (round 1). All 3 acceptance criteria met, no scope violations, no findings. Reviewer independently re-ran apps/host's build, the write-headers-file.ts script and the full apps/server test suite (123/123) and confirmed the results in this report.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added apps/server/src/security/headers.ts as the single source for the README's security headers (CSP with Turnstile's challenges.cloudflare.com in script-src/frame-src, connect-src 'self', HSTS, nosniff, Referrer-Policy, COOP, Permissions-Policy). worker.ts wraps every non-101 Worker response with them (/api/* and /ws/* errors); apps/server's build writes the same values into dist/public/_headers so Cloudflare Static Assets applies them to every HTML and asset response without running the Worker. apps/server/test/headers.test.ts asserts the header set matches the README exactly, asserts the generated _headers file, and asserts real Worker responses carry them (404, 400, 426, two 401s, 201, with the 101 upgrade correctly excluded) — 12 new tests, 123/123 total passing. Beyond the unit tests, verified against the real built bundle: pnpm build, wrangler dev --local, curl confirms every header on / and /host/, a headless-Chromium securitypolicyviolation listener shows zero CSP violations on either page, and tooling/smoke passed end-to-end (create room, host socket, room:welcome, room:end). That check found and fixed a real bug: apps/host injected its theme CSS at runtime via a <style> element, which style-src 'self' correctly blocked; fixed by giving apps/host the same build-time virtual-CSS-module Vite plugin apps/controller already used, so the CSP needed no relaxation and still matches the README byte-for-byte. Reviewer: story-reviewer pass, round 1, no findings.
<!-- SECTION:FINAL_SUMMARY:END -->
