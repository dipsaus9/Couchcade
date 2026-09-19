---
id: CC-3.24
title: 'Owner replay: Target Range on the direct link, then switch the link on'
status: To Do
assignee: []
created_date: '2026-09-17 17:51'
updated_date: '2026-09-19 08:25'
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
- [x] #1 docs/playtests/target-range.md records a replay with ?link=1 on every phone: date, players, devices, path per phone and feedback
- [x] #2 Every feedback item is a follow-up story or marked "no change"
- [ ] #3 After the owner approves the replay, VITE_REALTIME_LINK defaults to on in both apps and ?link=0 still turns the link off
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Owner involvement: ask the owner to replay on the live site with ?link=1 on every phone and collect feedback in chat. Switch on only after explicit approval.
Verify: pnpm check, pnpm test, pnpm build.

Owner replayed Target Range solo with ?link=1 on both TV and phone (2026-09-19). Link performed exactly as the CC-3.13 spike predicted: connected direct, felt noticeably less laggy and more responsive. Every gameplay issue raised (shot-vs-crosshair mismatch, board distance, missing hit sounds, calibration lock-out, relative-aim suggestion, reload-to-touch, missing end-game control, and a live Strike Night swing-detection report) is pre-existing to the games/platform, not caused by the link — filed as CC-11.10, CC-11.11, CC-7.8, CC-5.11, CC-5.12 (owner-gate), CC-5.13, CC-3.27, CC-12.8. AC3 (flip VITE_REALTIME_LINK on by default) held pending explicit owner approval, since CC-11.10 (shot lands wrong) affects how the game feels regardless of link state.
<!-- SECTION:NOTES:END -->
