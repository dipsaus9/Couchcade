---
id: CC-4.4
title: 'Build the UI kit: buttons, panels, player chip and big action'
status: To Do
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 12:28'
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
- [ ] #1 Button variants primary, go, stop and quiet match the house style, sink on pointerdown and are at least 56 px tall
- [ ] #2 The big action supports the waiting, don't-tap, act-now, hold and disabled states
- [ ] #3 Component tests run axe-core with no violations
- [ ] #4 package.json uses wildcard subpath exports
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test
<!-- SECTION:NOTES:END -->
