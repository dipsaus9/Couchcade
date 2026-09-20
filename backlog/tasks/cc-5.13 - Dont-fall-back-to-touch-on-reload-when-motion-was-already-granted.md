---
id: CC-5.13
title: Don't fall back to touch on reload when motion was already granted
status: Done
assignee: []
created_date: '2026-09-19 08:24'
updated_date: '2026-09-20 09:24'
labels:
  - story
dependencies: []
references:
  - apps/controller/src/motion/
  - apps/controller/src/App.vue
  - apps/controller/test/
parent_task_id: CC-5
type: bug
ordinal: 232000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Outcome: reloading the phone page during a motion game re-uses a motion permission the browser already granted, instead of falling back to touch controls.

Type: deliverable
Branch: CC-5.13/no-touch-fallback-after-reload

Reported during the CC-3.24 owner replay (2026-09-19): "if I reload it falls back to trackpad instead, but I want the motion." apps/controller/src/motion/ has no persisted record of a prior grant and re-runs the full permission step on every reload; needs investigation of whether the browser's own already-granted permission is being detected and used, or whether the step times out/defaults to touch before it resolves.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 After a page reload, if the browser still has motion permission granted from earlier in the session, the game resumes on motion without falling back to touch
- [x] #2 A test covers reload-after-grant and confirms motion, not touch, is offered/used
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Root cause (read apps/controller/src/motion/*.ts, App.vue, runtime/controller.ts,
runtime/state.ts in full first): session.ts's follow() only builds a MotionGame when it sees the
host's `motion-permission` view. On a page reload the whole module's in-memory state (including
this session's `adapter` singleton) resets, but the browser's own devicemotion permission grant
usually survives (motion.md). If the reload lands mid-game -- after the phone already passed the
motion-permission screen -- the host never resends that view; it just resends the running game's
own `controller:state`. follow() then hits `if (game === null) return;` and never builds any
MotionGame at all. runtime/controller.ts's controllerMotion() correctly (and, pre-fix,
intentionally, per its own doc comment) treats a null/mismatched MotionGame as no motion step ->
touch. So a reload-mid-game silently lands on touch with zero chance to recover, even though the
browser would still say granted.

Fix, entirely inside the story's References:
- apps/controller/src/motion/grant.ts (new): sessionStorage-backed record of the last game whose
  motion step reached "ready" (gameId/title/step), written the moment calibration completes,
  cleared on toTouch() and on end(). sessionStorage survives a reload in the same tab but not a
  new tab, matching "granted earlier in the session".
- apps/controller/src/motion/session.ts: follow() now checks the remembered grant when it
  reconnects into an active game with no local MotionGame (gameId set, screen isn't
  `motion-permission`, and it isn't the `next-game` late-joiner screen). A matching grant rebuilds
  the game paused with calibration: null, instead of leaving it unset. `resume()` ("Tap to resume")
  re-asks the browser inside the real tap (so gesture-requiring browsers such as iOS still work)
  and, when calibration is null, redoes the one second of holding still via a new shared
  afterGranted() helper (extracted from enable()) instead of assuming the old calibration still
  applies. Never calls DeviceMotionEvent directly here -- only through the existing
  @couchcade/motion adapter, per the "only code that touches DeviceMotionEvent" rule.
- apps/controller/src/motion/copy.ts + MotionResume.vue: a `reason: "sleep" | "reload"` prop swaps
  in accurate copy ("That reload switched motion off...") instead of reusing the sleep-specific
  "Your screen went to sleep" text.
- apps/controller/src/App.vue: derives resumeReason from `calibration === null` (no new session
  state needed) and passes it to MotionResume.

Explicitly out of scope / considered and rejected: calling DeviceMotionEvent.requestPermission()
without an active user gesture from packages/motion/src/sensors/browser.ts (would need a change
outside the story's References and would fight the project's own gesture-safety guard); e2e
coverage (e2e/ isn't in References, and the existing sleep/resume e2e spec already covers the
adjacent "Tap to resume" UI unaffected by this change).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified locally: pnpm check, pnpm test, pnpm build, pnpm check:style, pnpm check:deps all pass
(apps/controller: 198/198 tests incl. 2 new files, motion/grant.test.ts and additions to
motion/session.test.ts covering the reload-then-resume path, a mismatched-grant no-op, a refused
resume tap, and grant clearing on touch/game-end). vue-tsc --noEmit on apps/controller is clean.

Local e2e (platform/motion-permission.spec.ts) could not be run to completion in this sandbox: it
fails at room creation (Turnstile has no outbound network here), before any motion code runs --
unrelated to this diff, which touches no host/room/Turnstile code. Relying on GitHub Actions CI
for the real e2e signal; will report the PR's CI result.

Independent reviewer (sonnet, round 1): verdict pass. Both acceptance criteria met, no scope violations, no findings. Reviewer independently re-ran apps/controller/test/motion/session.test.ts and grant.test.ts (23/23 pass) and confirmed the diff stays inside the declared References.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Root cause: a page reload resets apps/controller's in-memory motion session, and if the reload
lands mid-game (past the motion-permission screen), the host never resends that view, so follow()
never rebuilt any MotionGame and the game silently ran on touch even though the browser still had
permission granted. Fixed by remembering the last game whose motion step reached "ready" in
sessionStorage (new apps/controller/src/motion/grant.ts), so a reload-mid-game reconnect rebuilds
the game paused with no calibration instead of leaving it unset. "Tap to resume" re-asks the
browser inside a real tap (still safe for gesture-requiring browsers) and redoes the one-second
calibration via a shared afterGranted() helper extracted from enable(). MotionResume.vue and
copy.ts got an accurate "that reload switched motion off" message instead of reusing the
sleep-specific copy. Covered by new tests in apps/controller/test/motion/grant.test.ts and a new
"reload recovery (CC-5.13)" describe block in session.test.ts (reload-then-resume resolves to
motion, a missing/mismatched grant still falls to touch, a refused resume tap still falls to
touch, grant clears on touch/game-end). pnpm check, test, build, check:style, check:deps all
green; independent reviewer (sonnet) passed round 1 with no findings.
<!-- SECTION:FINAL_SUMMARY:END -->
