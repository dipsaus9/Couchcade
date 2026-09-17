---
id: CC-5.9
title: Add the sensor trace recorder page and trace fixture format
status: In Progress
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-17 08:42'
labels:
  - story
dependencies:
  - CC-5.2
  - CC-1.12
references:
  - apps/controller/src/dev/trace-recorder/
  - packages/motion/test/traces/
  - apps/controller/package.json
parent_task_id: CC-5
type: chore
ordinal: 79000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Real phone motion can be recorded as test fixtures.

Type: deliverable
Branch: CC-5.9/trace-recorder
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 pnpm trace:record serves a dev-only controller page that records labelled traces as JSON
- [x] #2 The fixture format is documented in packages/motion/test/traces/README.md
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. apps/controller/package.json: add exactly one script line, trace:record -> `vite --config src/dev/trace-recorder/vite.config.ts` (root trace:record already delegates here). No other package.json edit (dependency-only, no new deps: reuse vue + @vitejs/plugin-vue, already declared; @couchcade/motion is deliberately NOT imported since it isn't a declared dependency).
2. apps/controller/src/dev/trace-recorder/: standalone Vite dev server, isolated from the main app build (own root/index.html/main.ts, no import from apps/controller/src/main.ts or vice versa, so `vite build` never bundles it):
   - vite.config.ts: own root, port 5176 (5173-5175 taken), server.host true, server.allowedHosts [".trycloudflare.com"] (tunnel hostname changes per run), a dev-only POST /api/trace middleware that validates and writes packages/motion/test/traces/<gesture>/<platform>-<label>.json (auto-suffixing on a repeat label instead of overwriting), and a plugin that prints the `npx cloudflared tunnel --url http://localhost:5176` hint once the server starts (motion.md "Recording (CC-5.9)").
   - trace-format.ts: pure helpers (gesture/platform enums, kebab-case label check, vector rounding to 3 decimals, gravity-sign detection per motion.md's sign rule, default `expect`). Hand-mirrors packages/motion/src/sensors/trace.ts's shape without importing it (no new dependency).
   - RecorderApp.vue + main.ts + index.html: tap "Enable motion" (calls DeviceMotionEvent.requestPermission() synchronously where present, same pattern as CC-5.2's adapter), 1 s hold-still calibration that detects the gravity sign, live rotation-rate/acceleration/interval readout, gesture+label+platform+device fields, a press-and-hold grip/record button that buffers samples with grip-down/grip-up marks, Save (POSTs to /api/trace) / Discard.
3. packages/motion/test/traces/README.md: document trace format v1 exactly as motion.md's "Trace format (version 1)" section (fields, an example), the €0 HTTPS research (cloudflared quick tunnel vs a local self-signed cert - tunnel wins: zero new dependencies, no per-device cert trust step, matches the project's existing README "Testing on a real phone" convention), and owner recording steps (start, labels to record: swing slow/medium/firm x left/right twist, aim sweeps, flick, tilt, shake, still).
4. Verify: pnpm check, pnpm test, pnpm build (then grep apps/controller/dist for recorder-only strings to confirm it never ships), pnpm check:style, pnpm check:deps.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Optional owner action: record a few swings, flicks, tilts and shakes on an iPhone and an Android phone.

Amended 2026-09-16 (motion.md conflict 6): only the trace:record script line touches apps/controller/package.json.

Implementation: apps/controller/package.json gained exactly one script line, trace:record -> vite --config src/dev/trace-recorder/vite.config.ts (no other package.json edit, no new dependency - reuses vue and @vitejs/plugin-vue, already dependencies). The recorder (apps/controller/src/dev/trace-recorder/) is a standalone Vite root with its own index.html/main.ts/vite.config.ts, never imported by apps/controller/src/main.ts, so it never reaches the production bundle - verified: pnpm build, then grep -rl "trace-recorder|grip-down|Enable motion" apps/controller/dist apps/server/dist found nothing, and apps/controller/dist stayed at 49.16 KB gzip JS (unchanged, well under the 80 KB budget).

HTTPS research (per motion.md "Recording (CC-5.9)"): chose the Cloudflare quick tunnel (npx cloudflared tunnel --url http://localhost:5176), printed by the dev server on start, over @vitejs/plugin-basic-ssl - the CC-5.9 amendment only allows the trace:record script line in package.json, not a new devDependency a plugin would need, and a tunnel needs no per-phone cert trust step. Documented with the rejected alternative in packages/motion/test/traces/README.md. server.allowedHosts is set to [".trycloudflare.com"] since the tunnel hostname is random per run.

Manually smoke-tested the dev server: started `pnpm run trace:record`, confirmed it serves the page and prints the tunnel hint, POSTed a synthetic version-1 trace to /api/trace (saved to packages/motion/test/traces/still/android-smoke-test.json with the exact documented shape), confirmed an invalid gesture is rejected with a 400, and confirmed a repeat label auto-suffixes to -2 instead of overwriting. Smoke-test fixtures were deleted afterwards and the dev server stopped; packages/motion/test/traces/ ships with only README.md (recording real traces is the story's optional owner action, not done by this delivery - no phone hardware available to the agent).

pnpm check, test, build, check:style, check:deps all green.
<!-- SECTION:NOTES:END -->
