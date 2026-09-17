---
id: CC-3.24
title: 'Owner replay: Target Range on the direct link, then switch the link on'
status: To Do
assignee: []
created_date: '2026-09-17 17:51'
updated_date: '2026-09-17 17:52'
labels:
  - story
  - owner-playtest
dependencies:
  - CC-3.22
  - CC-11.7
  - CC-3.19
  - CC-3.20
references:
  - docs/playtests/target-range.md
  - apps/controller/src/runtime/link-switch.ts
  - apps/host/src/runtime/link-switch.ts
parent_task_id: CC-3
priority: medium
type: chore
ordinal: 224000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner replays Target Range with the link on, feedback becomes stories, and after approval the link is on by default with ?link=0 as the escape hatch (docs/architecture/realtime-link.md, Rollout steps 9 and 10).

Type: deliverable
Branch: CC-3.24/target-range-link-replay
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 docs/playtests/target-range.md records a replay with ?link=1 on every phone: date, players, devices, path per phone and feedback
- [ ] #2 Every feedback item is a follow-up story or marked "no change"
- [ ] #3 After the owner approves the replay, VITE_REALTIME_LINK defaults to on in both apps and ?link=0 still turns the link off
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Owner involvement: ask the owner to replay on the live site with ?link=1 on every phone and collect feedback in chat. Switch on only after explicit approval.
Verify: pnpm check, pnpm test, pnpm build.
<!-- SECTION:NOTES:END -->
