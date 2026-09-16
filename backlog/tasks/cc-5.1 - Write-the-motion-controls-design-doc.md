---
id: CC-5.1
title: Write the motion controls design doc
status: In Progress
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 16:36'
labels:
  - story
  - owner-gate
dependencies:
  - CC-1.1
references:
  - docs/architecture/motion.md
parent_task_id: CC-5
type: docs
ordinal: 71000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
An approved sensor strategy and gesture event contracts.

Type: deliverable
Branch: CC-5.1/motion-design-doc
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 docs/architecture/motion.md covers sensor choice (devicemotion on both platforms, rotationRate first), iOS permission UX, calibration, safety (grip-hold), trace format
- [x] #2 It defines event contracts with fields and units for swing, aim, flick, tilt and shake, plus the touch fallback for each
- [ ] #3 Owner approval is recorded in the task notes as "Approved by owner: <YYYY-MM-DD>" before the story is Done
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Read CC-5 epic and stories, motion game epics, platform.md, security.md, platform-screens.md, README, TECH_STACK, HOUSE_STYLE.
2. Research browser motion APIs (iOS requestPermission, Chrome, rates, frames, orientation lock, Generic Sensor API, Safari quirks) and Wii-style motion mapping and web gesture implementations, with sources.
3. Write docs/architecture/motion.md: decisions first, open owner decisions with recommendations, then binding detail for CC-5.2..5.10 (adapter, permission flow, calibration and sign detection, event contracts with fields and units plus touch fallbacks, budget fit at 4 inputs/s, safety, trace format and test layers, conflicts, story map, sources).
4. Verify, commit, review, push, draft PR; leave In Progress for owner approval.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Owner gate: open the docs PR, send the owner a short summary plus the PR link in chat, and wait for explicit approval. Merge only after approval; record it with --append-notes.

Research findings (2026-09-16), sources in docs/architecture/motion.md:
- iOS: DeviceMotionEvent.requestPermission() needs a secure context and transient user activation; WebKit returns a saved per-origin decision without re-prompting (lifetime after reload/tab close unverified, CC-5.10 checks on an iPhone). One permission covers motion and orientation.
- Chrome shipped requestPermission() (M151/152) with default still allow; Google plans default ask. Design: call it wherever it exists, inside a tap.
- Both WebKit and Chromium deliver devicemotion at ~60 Hz; events stop while the page is hidden.
- rotationRate alpha/beta/gamma are around x/y/z per the current spec (older MDN explainer is outdated).
- WebKit builds accelerationIncludingGravity from Core Motion without a sign flip, so iPhones may read inverted gravity (unverified); calibration detects the sign from the screen-facing pose instead of trusting the platform.
- Generic Sensor API is Chromium only; screen.orientation.lock unsupported on iOS Safari; wake lock Safari 16.4+; no Vibration on iOS.
- Conflicts flagged in the doc: CC-5.5 AC2 '15 Hz' read as sampling rate at <=4 msgs/s; README 15 msg/s stale; host side of motion step unowned; aim playback helper for game-sdk; approved denied-screen hint may be wrong on iPhone; CC-5.9 needs apps/controller/package.json in References.

Review (dipsaus-ai:story-reviewer, round 1): criteria 1 and 2 met, no scope violations, no findings. Criterion 3 is the owner gate and stays pending; the mechanical block is only that gate. Status stays In Progress until the owner approves.

Review round 2 (after merging origin/main with session-flow.md and aligning to its CC-3.6 set/fire input stream, wake lock scope and motion-check transition): criteria 1 and 2 met, no scope violations, no findings. Criterion 3 is the owner gate.
<!-- SECTION:NOTES:END -->
