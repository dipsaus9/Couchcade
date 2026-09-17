---
id: CC-4.12
title: Expand the font subsets to accented Latin letters
status: To Do
assignee: []
created_date: '2026-09-17 09:02'
updated_date: '2026-09-17 09:02'
labels:
  - story
dependencies:
  - CC-4.3
references:
  - tooling/fonts/
  - packages/theme/fonts/
  - packages/theme/test/fonts.test.ts
parent_task_id: CC-4
type: chore
ordinal: 207000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Player names with accents (Renée, Chloë, Zoë, Jürgen) show correctly on the TV and phones instead of boxes, as security.md's name allowlist requires.

Type: deliverable
Branch: CC-4.12/accented-font-subset
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 tooling/fonts subsets Fredoka and Pixelify Sans to Basic Latin plus the Latin-1 Supplement and Latin Extended-A letters that docs/architecture/security.md allows in names
- [ ] #2 The two WOFF2 files still total at most 40 KB and pnpm budgets passes
- [ ] #3 A test renders every allowed name character in both fonts without falling back to .notdef
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Owner decision 2026-09-17: allow accented names; fonts must cover them (CC-4.3 subset was ASCII only, 20,588 B used of 40,960).
<!-- SECTION:NOTES:END -->
