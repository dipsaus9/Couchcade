---
id: CC-4.3
title: Self-host subsetted Fredoka and Pixelify Sans fonts
status: To Do
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 12:28'
labels:
  - story
dependencies:
  - CC-4.2
references:
  - packages/theme/fonts/
parent_task_id: CC-4
type: chore
ordinal: 63000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Both fonts load from our own origin within the 40 KB budget.

Type: deliverable
Branch: CC-4.3/self-hosted-fonts
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Two WOFF2 files total ≤ 40 KB
- [ ] #2 OFL.txt ships next to the font files
- [ ] #3 The theme CSS declares @font-face with the house style fallback stacks
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test
<!-- SECTION:NOTES:END -->
