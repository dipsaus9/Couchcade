---
id: CC-3.14
title: Amend the approved architecture docs for the real-time link
status: To Do
assignee: []
created_date: '2026-09-17 17:49'
updated_date: '2026-09-17 17:49'
labels:
  - story
dependencies:
  - CC-3.13
references:
  - docs/architecture/platform.md
  - docs/architecture/security.md
  - docs/architecture/session-flow.md
  - docs/architecture/motion.md
  - docs/TECH_STACK.md
  - docs/games/target-range.md
parent_task_id: CC-3
priority: medium
type: docs
ordinal: 213000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
platform.md, security.md, session-flow.md, motion.md, TECH_STACK.md and target-range.md match the approved real-time link design (docs/architecture/realtime-link.md, Found while writing rows 5 to 12 and the proposed budget text).

Type: deliverable
Branch: CC-3.14/realtime-link-doc-amendments
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 docs/architecture/platform.md lists rtc:offer, rtc:answer, link:ping and link:pong, shows the direct link in How traffic flows, and has the proposed budget rule text from docs/architecture/realtime-link.md
- [ ] #2 docs/architecture/security.md has the link threat rows and the rule that ICE candidates and descriptions are never stored or logged
- [ ] #3 docs/architecture/session-flow.md, docs/architecture/motion.md, docs/TECH_STACK.md and docs/games/target-range.md no longer contradict docs/architecture/realtime-link.md on stream rates, playback delay, relay sample packing, WebRTC status or Target Range aim speed
- [ ] #4 Each amended doc's status line names CC-3.14 and the owner approval of docs/architecture/realtime-link.md on 2026-09-17
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Only apply what docs/architecture/realtime-link.md already decided; no new decisions. If the spike (CC-3.13) was a no-go, amend only the relay smoothing and aim speed parts.
Verify: pnpm check, pnpm test, pnpm build.
<!-- SECTION:NOTES:END -->
