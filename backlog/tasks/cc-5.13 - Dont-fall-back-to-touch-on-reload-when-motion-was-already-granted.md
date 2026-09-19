---
id: CC-5.13
title: Don't fall back to touch on reload when motion was already granted
status: To Do
assignee: []
created_date: '2026-09-19 08:24'
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
- [ ] #1 After a page reload, if the browser still has motion permission granted from earlier in the session, the game resumes on motion without falling back to touch
- [ ] #2 A test covers reload-after-grant and confirms motion, not touch, is offered/used
<!-- AC:END -->
