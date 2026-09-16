---
id: CC-1.1
title: Write the platform architecture doc in docs/architecture/platform.md
status: To Do
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 12:27'
labels:
  - story
  - owner-gate
dependencies:
  - CC-1.3
references:
  - docs/architecture/platform.md
parent_task_id: CC-1
priority: high
type: docs
ordinal: 24000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A reviewed architecture doc that every platform and game story builds on: package map, relay design, protocol, join flow, game contract, clock sync, dev/deploy topology and repo conventions.

Type: deliverable
Branch: CC-1.1/platform-architecture-doc
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 docs/architecture/platform.md has sections: package map and dependency direction, relay (partyserver, hibernation rules), protocol envelope and full platform message catalogue, room lifecycle and join flow (QR, room code, host passcode, tickets), game contract and auto-discovery registry, clock sync, local dev and deploy topology, free-tier budget rules, repo conventions
- [ ] #2 The doc contains a Mermaid diagram of host/relay/phone traffic and a Mermaid diagram of package dependencies
- [ ] #3 The conventions section covers: root scripts defined once in the scaffold, wildcard subpath exports per package, lockfile conflicts resolved by rebase + pnpm install, per-game CREDITS.md and scene palette files
- [ ] #4 The dev topology section records the decision from CC-1.3
- [ ] #5 Owner approval is recorded in the task notes as "Approved by owner: <YYYY-MM-DD>" before the story is Done
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Owner gate: open the docs PR, send the owner a short summary plus the PR link in chat, and wait for explicit approval. Merge only after approval; record it with --append-notes.
Inputs: README.md, docs/TECH_STACK.md, docs/HOUSE_STYLE.md, planning decisions of 2026-09-16 (host passcode, QR join, English only, lean tests, CC0 assets, build with partyserver/partysocket/nipplejs).
<!-- SECTION:NOTES:END -->
