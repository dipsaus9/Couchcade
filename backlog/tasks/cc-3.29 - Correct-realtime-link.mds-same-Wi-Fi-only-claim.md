---
id: CC-3.29
title: Correct realtime-link.md's same-Wi-Fi-only claim
status: To Do
assignee: []
created_date: '2026-09-20 12:48'
labels:
  - story
dependencies: []
references:
  - docs/architecture/realtime-link.md
parent_task_id: CC-3
type: docs
ordinal: 238000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Outcome: docs/architecture/realtime-link.md no longer claims the direct link only connects on the same Wi-Fi network.

Type: deliverable
Branch: CC-3.29/realtime-link-cross-network-doc

CC-3.13's owner spike run (2026-09-18) found the no-STUN direct link also connects across networks (Wi-Fi phone to 4G phone), via a host/host candidate pair -- likely because both devices had globally-routable IPv6. realtime-link.md's "Who connects directly" table, its owner answer 1, and Non-goals item 5 still state same-Wi-Fi-only. CC-3.14 (which synced every OTHER doc to realtime-link.md) deliberately left this alone since realtime-link.md itself isn't in its References and is the source of truth being contradicted, not a doc to sync toward it.

Correct realtime-link.md's own claim using the CC-3.13 spike evidence (Wi-Fi: 2410ms connect, host/host pair; 4G: 580ms connect, host/host pair -- both real device runs, recorded in this session's history), then check whether any doc CC-3.14 already touched needs a small cascade update as a result.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 docs/architecture/realtime-link.md's 'Who connects directly' table, Non-goals and any owner-answer text reflect that the direct link can connect across different networks (not only same-Wi-Fi), sourced from CC-3.13's real spike evidence
- [ ] #2 Any other doc whose wording assumed same-Wi-Fi-only as a consequence of realtime-link.md's old claim is updated to match
<!-- AC:END -->
