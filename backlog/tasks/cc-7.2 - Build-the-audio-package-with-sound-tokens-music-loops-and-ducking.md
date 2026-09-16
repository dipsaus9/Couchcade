---
id: CC-7.2
title: 'Build the audio package with sound tokens, music loops and ducking'
status: To Do
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 12:28'
labels:
  - story
dependencies:
  - CC-7.1
  - CC-1.5
references:
  - packages/audio/
parent_task_id: CC-7
type: feature
ordinal: 88000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Host code plays sounds by house style token.

Type: deliverable
Branch: CC-7.2/audio-package
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 play("celebrate") etc. exist for every motion token
- [ ] #2 Music ducks by 50% during callouts
- [ ] #3 Audio unlocks on the first user gesture
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test
<!-- SECTION:NOTES:END -->
