---
id: CC-3.22
title: Add E2E tests for the direct link and the relay fallback
status: To Do
assignee: []
created_date: '2026-09-17 17:51'
updated_date: '2026-09-17 17:51'
labels:
  - story
dependencies:
  - CC-3.19
  - CC-3.20
  - CC-11.9
references:
  - e2e/platform/realtime-link.spec.ts
  - e2e/src/link.ts
parent_task_id: CC-3
priority: high
type: chore
ordinal: 222000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Playwright proves the real browser wiring: a phone reaches the direct path, falls back when the link is cut, and relinks after a TV reload (docs/architecture/realtime-link.md, Testing).

Type: deliverable
Branch: CC-3.22/realtime-link-e2e
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 e2e/platform/realtime-link.spec.ts shows a Chromium phone reaching the direct path through the test hook, and a Target Range bot match completing with no input message on that phone's relay socket during a volley
- [ ] #2 Cutting the link through the test hook moves the phone to the relay path within 1 s and the match still completes
- [ ] #3 Reloading the TV brings the phone's link back after room:host connected true
- [ ] #4 In the WebKit project the specs assert the direct path when Playwright WebKit supports RTCPeerConnection, otherwise the relay path, and the task notes record which
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check, pnpm test, pnpm build, pnpm e2e.
<!-- SECTION:NOTES:END -->
