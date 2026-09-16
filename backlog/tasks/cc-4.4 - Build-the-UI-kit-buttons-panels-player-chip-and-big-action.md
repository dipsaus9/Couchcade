---
id: CC-4.4
title: 'Build the UI kit: buttons, panels, player chip and big action'
status: Done
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 16:50'
labels:
  - story
dependencies:
  - CC-4.1
  - CC-4.2
references:
  - packages/ui/package.json
  - packages/ui/src/components/
parent_task_id: CC-4
type: feature
ordinal: 64000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Vue components that make any phone screen look like Clubhouse.

Type: deliverable
Branch: CC-4.4/ui-kit-components
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Button variants primary, go, stop and quiet match the house style, sink on pointerdown and are at least 56 px tall
- [x] #2 The big action supports the waiting, don't-tap, act-now, hold and disabled states
- [x] #3 Component tests run axe-core with no violations
- [x] #4 package.json uses wildcard subpath exports
- [x] #5 Chalk labels on Turf (go) and Signal (stop) fills have a thin Ink outline (2px phone, 3px TV) plus the Ink text shadow, and the axe-core contrast check passes for them (owner decision 2026-09-16)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Scaffold packages/ui: package.json (wildcard exports . and ./*), tsconfig (vue base), vitest.config.ts (Vitest browser mode, Playwright Chromium, so axe-core computes real colours), src/index.ts, test/setup.ts injecting toCssVars().
2. src/components/: CcButton (primary/go/stop/quiet, phone/tv, small 64px TV, sinks on pointerdown, pointerdown trigger for gameplay with keyboard fallback), CcPanel (optional Sky tab), CcPlayerShape + CcPlayerChip (shape, name, Pixelify score), CcBigAction (waiting/dont-tap/act-now/hold/disabled, press/release events). All colours from --cc-* vars; Chalk labels on Turf/Signal get -webkit-text-stroke 2px phone / 3px TV Ink + Ink text shadow; transitions off under prefers-reduced-motion.
3. test/components/: behaviour tests plus axe-core runs with zero violations, including a negative control proving the contrast check fails without the outline.
4. Catalog: playwright, @vitest/browser-playwright, @vue/test-utils.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test

Amended 2026-09-16: owner chose option A for Chalk-on-Turf/Signal contrast (found in CC-4.2); see docs/HOUSE_STYLE.md colour rules.

Review (dipsaus-ai:story-reviewer, round 1): pass. All 5 criteria met, no scope violations. Advisory: the test script runs 'playwright install chromium-headless-shell' each run; it is a no-op when the browser is cached, and it keeps CI working without editing the shared workflow.
Implementation note: component tests run in Vitest browser mode (Playwright Chromium) because axe-core's color-contrast needs real computed styles and layout; in jsdom it returns incomplete. axe 4.13 treats -webkit-text-stroke >= 0.03em as the text colour, so the Ink outline is what makes Chalk on Turf pass; control tests prove the check fails without it.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added @couchcade/ui with wildcard subpath exports and the first components in src/components: CcButton (primary, go, stop, quiet; phone and TV sizes incl. the 64px TV Kick button; sinks on pointerdown; pointerdown trigger for gameplay with a keyboard fallback), CcPanel (optional Sky tab), CcPlayerShape and CcPlayerChip (player shape in colour, Fredoka name, Pixelify score, audience Sky circle), and CcBigAction (waiting, dont-tap, act-now, hold, disabled; press and release events, pointer capture for holds, Space/Enter support). Chalk labels on Turf and Signal carry a 2px (phone) or 3px (TV) Ink text stroke plus the Ink text shadow. Transitions switch off under prefers-reduced-motion. 78 component tests run in Vitest browser mode on Playwright Chromium with axe-core: no violations for every variant and state, the contrast check passes on the outlined labels, and control tests show it fails without the outline.
<!-- SECTION:FINAL_SUMMARY:END -->
