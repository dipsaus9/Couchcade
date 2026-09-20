---
id: CC-3.29
title: Correct realtime-link.md's same-Wi-Fi-only claim
status: Done
assignee: []
created_date: '2026-09-20 12:48'
updated_date: '2026-09-20 12:56'
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
- [x] #1 docs/architecture/realtime-link.md's 'Who connects directly' table, Non-goals and any owner-answer text reflect that the direct link can connect across different networks (not only same-Wi-Fi), sourced from CC-3.13's real spike evidence
- [x] #2 Any other doc whose wording assumed same-Wi-Fi-only as a consequence of realtime-link.md's old claim is updated to match
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Correct realtime-link.md's 'Who connects directly' intro/table, owner answer 1, Non-goals item 5, and the Decisions-at-a-glance row 7 that restates it, using CC-3.13's real spike evidence (Wi-Fi 2410ms host/host, 4G 580ms host/host, likely globally-routable IPv6). Say the direct link can connect across different networks when both sides' host candidates can already reach each other, but that this isn't guaranteed on every network -- same Wi-Fi stays the reliable common case, not a hard requirement. Then check CC-3.14's already-synced docs (session-flow.md, motion.md, TECH_STACK.md, target-range.md, platform.md, security.md) for a same-Wi-Fi-only assumption inherited from the old claim; none found needing a change (TECH_STACK.md's WebRTC row already says phones on 4G/guest Wi-Fi 'often' can't connect, which is consistent with the corrected picture), so no file outside this story's References needs editing.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
AC1: Corrected 'Who connects directly' intro + table (4G/5G row), owner answer 1, Non-goals item 5, and Decisions-at-a-glance row 7 (which literally restates owner answer 1). Cited CC-3.13's real owner spike run (2026-09-18): Wi-Fi connected 2410ms host/host RTT 6-9ms; 4G (different network from TV) also connected, 580ms, also host/host. Likely explanation recorded: both devices had globally-routable IPv6 addresses, letting host candidates reach each other across networks/NATs; not guaranteed on every network (no IPv6, or a NAT/firewall that hides candidates, still falls back to relay). Framed same-Wi-Fi as the reliable common case, not a hard requirement -- no new absolute claim. AC2: Checked every doc CC-3.14 already synced (session-flow.md, motion.md, TECH_STACK.md, target-range.md, platform.md, security.md) for wording that assumed same-Wi-Fi-only as a consequence of realtime-link.md's old claim. Found none: their Wi-Fi/4G mentions are about reconnect, timing-independent-of-Wi-Fi-speed, or join-rate context, unrelated to the link's connectivity scope. TECH_STACK.md's WebRTC row ('Phones on 4G, guest Wi-Fi or a network with client isolation often can't find each other without a TURN server') already hedges with 'often', not 'only' or 'always', so it stays consistent with the corrected picture and needs no edit. No file outside this story's declared Reference (docs/architecture/realtime-link.md) required a change.

Reviewer verdict (story-reviewer, model sonnet, round 1): pass. AC1 met, AC2 met, no scope violations, no findings. Reviewer independently spot-checked the six CC-3.14-synced docs and confirmed no downstream same-Wi-Fi-only wording needed a fix; noted platform.md's 'How traffic flows' was already amended by CC-3.14 to generic 'when the network lets the two find each other' phrasing, consistent with this story's correction.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Corrected docs/architecture/realtime-link.md's same-Wi-Fi-only claim using CC-3.13's real owner spike evidence (2026-09-18, no-STUN ICE, real iPhone and laptop): Wi-Fi connected in 2410ms with a host/host ICE candidate pair; 4G (a different network from the TV's Wi-Fi) also connected, in 580ms, also host/host. Updated the 'Who connects directly' intro and table (new 4G/5G row), owner answer 1, Non-goals item 5, and the Decisions-at-a-glance row 7 that restates owner answer 1, to say the direct link can connect across different networks when both sides' host candidates can already reach each other -- most likely via a globally-routable IPv6 address on both, per the spike -- while being explicit this isn't guaranteed on every network (no IPv6, or a NAT/firewall hiding candidates, still falls back to relay). Same Wi-Fi is now framed as the reliable common case, not a hard requirement; no new absolute claim was introduced. Checked all six docs CC-3.14 already synced (session-flow.md, motion.md, TECH_STACK.md, target-range.md, platform.md, security.md) for a same-Wi-Fi-only assumption inherited from the old claim -- found none needing a fix, so only docs/architecture/realtime-link.md (the story's sole declared Reference) was touched. Verified with pnpm check/test/build, all green. Reviewed by dipsaus-ai:story-reviewer (model sonnet): pass, both acceptance criteria met, no scope violations, no findings.
<!-- SECTION:FINAL_SUMMARY:END -->
