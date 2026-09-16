---
id: CC-4.5
title: 'Build controller input components: joystick, d-pad, hold, mash and drag slider'
status: To Do
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 12:28'
labels:
  - story
dependencies:
  - CC-4.4
references:
  - packages/ui/src/controls/
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
- [ ] #1 A nipplejs joystick emits a normalised vector
- [ ] #2 A 4-way d-pad emits press/release per direction
- [ ] #3 Hold and mash buttons emit events with event.timeStamp; mash counts taps
- [ ] #4 A drag slider emits an absolute 0–1 position
- [ ] #5 All controls set touch-action: manipulation
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test
<!-- SECTION:NOTES:END -->
