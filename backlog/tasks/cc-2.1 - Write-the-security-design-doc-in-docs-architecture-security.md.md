---
id: CC-2.1
title: Write the security design doc in docs/architecture/security.md
status: To Do
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 12:27'
labels:
  - story
  - owner-gate
dependencies:
  - CC-1.1
references:
  - docs/architecture/security.md
parent_task_id: CC-2
type: docs
ordinal: 43000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
An approved threat model updated for the host passcode.

Type: deliverable
Branch: CC-2.1/security-design-doc
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The doc has a threat → defence → test table covering passcode brute force, room code guessing, direct WebSocket access, flooding, malformed messages, names, XSS and supply chain
- [ ] #2 It records where Turnstile runs now that hosting needs a passcode
- [ ] #3 Owner approval is recorded in the task notes as "Approved by owner: <YYYY-MM-DD>" before the story is Done
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Owner gate: open the docs PR, send the owner a short summary plus the PR link in chat, and wait for explicit approval. Merge only after approval; record it with --append-notes.
<!-- SECTION:NOTES:END -->
