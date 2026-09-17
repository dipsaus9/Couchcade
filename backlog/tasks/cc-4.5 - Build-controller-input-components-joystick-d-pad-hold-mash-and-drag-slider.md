---
id: CC-4.5
title: 'Build controller input components: joystick, d-pad, hold, mash and drag slider'
status: Done
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-17 17:02'
labels:
  - story
dependencies:
  - CC-4.4
references:
  - packages/ui/src/controls/
  - packages/ui/src/index.ts
  - packages/ui/package.json
  - packages/ui/test/controls/
parent_task_id: CC-4
type: feature
ordinal: 65000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Games get ready-made touch controls.

Type: deliverable
Branch: CC-4.5/controller-input-components
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A nipplejs joystick emits a normalised vector
- [x] #2 A 4-way d-pad emits press/release per direction
- [x] #3 Hold and mash buttons emit events with event.timeStamp; mash counts taps
- [x] #4 A drag slider emits an absolute 0–1 position
- [x] #5 All controls set touch-action: manipulation
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Add five raw touch/pointer input primitives to packages/ui/src/controls/ (kit tier, per docs/architecture/platform.md's package map: '@couchcade/ui ... touch controls (nipplejs)'):
- CcJoystick.vue: wraps nipplejs (catalog-pinned ^1.0.4, added to package.json deps), emits a normalised {x,y} vector (-1..1, y positive = up/towards the TV) on move and resets to {0,0} on end.
- CcDpad.vue: 4 direction buttons (up/down/left/right) in a cross layout, each emits press/release (PointerEvent) via the existing usePress() helper from components/press.ts, plus arrow-key support.
- CcHoldButton.vue: press/release button reusing usePress with pointer capture, emitting the native PointerEvent so callers read event.timeStamp (same pattern as CcBigAction).
- CcMashButton.vue: tap button that counts taps and emits {event, count} per tap; exposes reset() for a new round.
- CcDragSlider.vue: v-model:modelValue (0-1) slider, drag-anywhere-on-track + keyboard arrows, horizontal or vertical orientation.
All five set touch-action: manipulation (house style forbids touch-action: none outside the big action's own full-gesture need), use only @couchcade/theme CSS variables (no raw hex/fonts, so check:style stays green), and reuse press.ts rather than re-implementing pointer tracking.
Glue-only edits outside src/controls/: packages/ui/package.json (nipplejs dependency), packages/ui/src/index.ts (re-export the controls subpath), packages/ui/test/controls/*.test.ts (component tests mirroring test/components/helpers.ts conventions: mountIn, pointer, axe-core, contrast).
Out of scope (belongs to @couchcade/motion, CC-5.x): gesture detection, sensor adapters, the tilt/aim fallback wiring, and the ≤4 msg/s input-stream throttling (CC-3.6) — these controls only emit raw local events; a game's controller wires them into the throttled send() helper.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test

Implemented as five Vue components in packages/ui/src/controls/ (kit tier, @couchcade/ui/controls subpath):
- CcJoystick.vue wraps nipplejs (dataOnly + static mode; draws its own Chalk/Ink/Sunny visuals instead of nipplejs's default DOM). Emits move({x,y}) on every drag and once more with {0,0} on release. nipplejs itself sets an inline touch-action:none on its zone; the component overrides that back to manipulation right after creating the manager, to satisfy AC5 without losing nipplejs's own preventDefault()-based drag handling.
- CcDpad.vue: 4 independent press/release buttons in a CSS-grid cross, pointer + arrow-key driven, so two directions can be held for a diagonal.
- CcHoldButton.vue: press/release with pointer capture (usePress from components/press.ts, capture:true), so sliding off mid-hold doesn't drop the press; emits the native PointerEvent/KeyboardEvent so callers read event.timeStamp.
- CcMashButton.vue: same button chrome, no pointer capture; increments and emits a running tap count per tap, exposes reset() for a new round.
- CcDragSlider.vue: v-model:modelValue (0-1, absolute, never relative), drag-anywhere-on-track + tap-to-set + arrow/Home/End keys, horizontal or vertical.
Glue: nipplejs added to packages/ui/package.json deps (catalog already pinned nipplejs@^1.0.4 for this story per TECH_STACK.md); packages/ui/src/index.ts re-exports the new controls subpath; packages/ui/test/controls/*.test.ts (118 tests total in the package, all passing) mirror the existing test/components/helpers.ts conventions (mountIn, pointer, axe-core, contrast).
Verified: pnpm check, pnpm check:deps, pnpm check:style, pnpm test (all packages green), pnpm build all green in the worktree.

Reviewer (dipsaus-ai:story-reviewer, model sonnet, round 1): PASS. All 5 acceptance criteria met, no scope violations, no findings. Re-ran pnpm --filter @couchcade/ui test (118/118), pnpm check, pnpm check:deps, pnpm check:style independently, all green.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added five raw touch/pointer input primitives to packages/ui/src/controls/ (@couchcade/ui/controls): CcJoystick (nipplejs-backed, emits a normalised {x,y} vector, resets to zero on release), CcDpad (4 independent press/release directions via pointer and arrow keys), CcHoldButton and CcMashButton (emit the native PointerEvent/KeyboardEvent so callers read event.timeStamp; mash keeps a running tap count with a reset() escape hatch), and CcDragSlider (v-model 0-1 absolute position, drag/tap/keyboard, horizontal or vertical). All five set touch-action: manipulation. Glue: nipplejs added to packages/ui/package.json (already catalog-pinned), packages/ui/src/index.ts re-exports the controls subpath, and 118 new/total component tests live under packages/ui/test/controls/. pnpm check, check:deps, check:style, test and build are all green. Independent review (dipsaus-ai:story-reviewer, sonnet) passed round 1 with no findings.
<!-- SECTION:FINAL_SUMMARY:END -->
