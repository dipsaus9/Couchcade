---
id: CC-3.14
title: Amend the approved architecture docs for the real-time link
status: Done
assignee: []
created_date: '2026-09-17 17:49'
updated_date: '2026-09-20 12:31'
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
- [x] #1 docs/architecture/platform.md lists rtc:offer, rtc:answer, link:ping and link:pong, shows the direct link in How traffic flows, and has the proposed budget rule text from docs/architecture/realtime-link.md
- [x] #2 docs/architecture/security.md has the link threat rows and the rule that ICE candidates and descriptions are never stored or logged
- [x] #3 docs/architecture/session-flow.md, docs/architecture/motion.md, docs/TECH_STACK.md and docs/games/target-range.md no longer contradict docs/architecture/realtime-link.md on stream rates, playback delay, relay sample packing, WebRTC status or Target Range aim speed
- [x] #4 Each amended doc's status line names CC-3.14 and the owner approval of docs/architecture/realtime-link.md on 2026-09-17
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Read realtime-link.md in full (source of truth, approved 2026-09-17) plus the six referenced docs. Applied only what realtime-link.md already decided: (1) platform.md - rtc:offer/rtc:answer/link:ping/link:pong in the message catalogue, the direct link in How traffic flows (text+diagram), the proposed budget-rule amendments (decision 14, budget rule 4, new rules 14/15, cost table, clock sync step 5); (2) security.md - link threat rows and the ICE-candidates-never-stored-or-logged privacy rule; (3) session-flow.md/motion.md/TECH_STACK.md/target-range.md - removed contradictions on stream rates, playback delay, relay sample packing, WebRTC status and Target Range aim speed, scoped narrowly in motion.md to decisions 12/16, the Aim sending rules and Fitting-the-input-budget rules 1/4 only (left CC-5.12's calibration section untouched); (4) added a CC-3.14 amendment line naming the 2026-09-17 realtime-link.md approval to each doc's status line. Verified target-range.md's code-facing claims (aimPxPerDegree, input schema, playback delay constants) against the already-shipped games/target-range and apps/host/src/runtime/links.ts source before writing them.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Only apply what docs/architecture/realtime-link.md already decided; no new decisions. If the spike (CC-3.13) was a no-go, amend only the relay smoothing and aim speed parts.
Verify: pnpm check, pnpm test, pnpm build.

Checked, did not fix (outside this story's References, docs/architecture/realtime-link.md is not listed): realtime-link.md itself still says phones connect directly only on the same Wi-Fi (owner answer 1, Non-goals 5, the 'Who connects directly' table). CC-3.13's owner spike run (2026-09-18) found the no-STUN link also connects over 4G (host/host candidate pair, likely because iPhone cellular and this ISP hand out globally-routable IPv6), and CC-3.13's notes explicitly say 'Confirm this reading in CC-3.14; it changes the topology doc's claim that only same-Wi-Fi connects directly.' Since realtime-link.md's own text is not yet corrected, I did not invent a 'same network' fix in platform.md/security.md (neither doc currently states a same-Wi-Fi assumption about the link beyond what platform.md's 'How traffic flows' already said generally, which I updated). Recommend a small follow-up story to amend realtime-link.md's cross-network claim first, then cascade to any doc that assumes it. Also left untouched, correctly out of scope: motion.md's 'Owner decisions (2026-09-16)' item 2 and the CC-3.6 conflicts-table row 3 (historical prose, still says 250 ms / 15 msg-s, not named in realtime-link.md's Found-list); TECH_STACK.md's pre-existing 'batched to at most 15 messages per second' design rule (predates CC-1.4's 4/s measurement, not sourced from realtime-link.md); motion.md's stale 'Conflicts' table row 1 (CC-5.5 15 Hz criterion, not named in the Found-list either).

Reviewer (dipsaus-ai:story-reviewer, model haiku, round 1): PASS. All 4 acceptance criteria met, no scope violations, no findings.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Synced platform.md, security.md, session-flow.md, motion.md, TECH_STACK.md and target-range.md to the approved real-time link design (docs/architecture/realtime-link.md, approved 2026-09-17). platform.md now lists rtc:offer/rtc:answer/link:ping/link:pong, shows the direct link in How traffic flows and its diagram, and carries the proposed budget-rule amendments (decision 14, budget rules 4 and 6, new rules 14-15, cost table, clock sync step 5). security.md gained the real-time-link threat table and the ICE-candidates/descriptions-never-stored-or-logged privacy rule. session-flow.md, motion.md, TECH_STACK.md and target-range.md no longer contradict realtime-link.md on stream rates, playback delay, relay sample packing, WebRTC status or Target Range's aim speed; motion.md's edits were scoped strictly to decisions 12/16, the Aim sending rules and Fitting-the-input-budget rules 1/4, leaving CC-5.12's calibration section untouched. Target Range's numeric claims (aimPxPerDegree=6, the single-sample aim schema, the 180ms/~33ms playback delays) were checked against the already-shipped game and host source before writing them. Every amended doc's status line names CC-3.14 and the 17 September 2026 owner approval. Verify (pnpm check, pnpm test, pnpm build) all green. Independent review (story-reviewer, haiku): pass, no scope violations. Deliberately left out of scope, and flagged in the task notes instead: realtime-link.md's own same-Wi-Fi-only claim, which CC-3.13's owner spike found is not quite accurate (the link also connected over 4G) -- realtime-link.md is not a declared Reference for this story.
<!-- SECTION:FINAL_SUMMARY:END -->
