---
id: CC-6.5
title: Add the Pip customiser to the controller lobby
status: Done
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-18 06:18'
labels:
  - story
dependencies:
  - CC-6.3
  - CC-1.12
references:
  - apps/controller/src/pips/
  - apps/controller/src/screens/lobby/
  - apps/controller/test/pips/
  - apps/controller/src/session/
  - tooling/budgets/src/
  - tooling/budgets/test/
  - .size-limit.json
parent_task_id: CC-6
type: feature
ordinal: 85000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Players personalise their Pip while waiting.

Type: deliverable
Branch: CC-6.5/pip-customiser
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Players change skin tone, hairstyle and hair colour; changes send player:profile
- [x] #2 The profile persists in localStorage for the next room
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1) apps/controller/src/pips/pip-record.ts: couchcade:player localStorage record (v:1, name, profile), read+repair+write per pips.md 'On the phone: remembering a Pip', injectable SessionStorageLike (mirrors session/storage.ts). 2) apps/controller/src/pips/random-pip.ts: firstRandomPip() seeded from crypto.getRandomValues, shufflePip(current) that redraws with seed+1 on a repeat, mirroring packages/utils/src/room-code's CryptoSource pattern; both build on @couchcade/utils/pips randomPip/pipParts. 3) apps/controller/src/pips/profile-sender.ts: pure debounce/throttle (400ms after last change, max 1/s, skip unchanged) per pips.md 'Customiser changes', unit tested with fake timers -- this is the Budgets 'CC-6.5 unit test for the send rule'. 4) apps/controller/src/pips/PipCustomiser.vue: tabs (Skin/Hair/Colour) as a radiogroup of >=56px tiles with aria-checked, screen-reader labels from @couchcade/theme (pipSkinNames/pipHairNames/pipHairColourNames), Shuffle button, CcPip preview (full, happy, 150px, phone), Colour tab disabled+hinted when hair is bald (accessibility #5). Emits profile updates; LobbyScreen forwards them through the existing send prop -- no session/socket changes needed since PlayerInfo already carries profile and LobbyScreen already emits send. 5) apps/controller/src/pips/index.ts barrel. 6) Wire into apps/controller/src/screens/lobby/LobbyScreen.vue: 'Make your Pip' / 'Edit my Pip' toggle (quiet CcButton) that shows PipCustomiser inline; on first mount with no stored record, seed+store a fresh random Pip; if the loaded/created profile differs from you.profile (room ignores join-body profile until a later story per pips.md 'Found while writing this spec' #1), send one player:profile to reconcile. Reference amendment: added apps/controller/src/screens/lobby/ (the story's own title says 'to the controller lobby'; CC-6.3 set the precedent of amending References for a necessary wiring point). Tests: apps/controller/test/pips/ unit tests for the three pure modules (record repair rules, random/shuffle determinism given a fake crypto source, send-rule timing/dedup). No new e2e spec -- AC doesn't require one and none of the existing e2e specs cover the lobby Pip flow yet.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test

Reference amendment 2: tooling/budgets and .size-limit.json. docs/architecture/pips.md's Budgets table gives the customiser its own separate ceiling ('Customiser screen as a lazy chunk <= 4 KB', distinct from the 80KB 'Controller initial JS' platform ceiling) precisely because it is meant to be a lazy (dynamic-import) chunk that a phone never downloads unless it opens the customiser. tooling/budgets/src/classify.ts's platform bucket currently sums every non-game chunk regardless of eager/lazy, so once apps/controller/src/screens/lobby/LobbyScreen.vue correctly loads PipCustomiser.vue via defineAsyncComponent (per that same Budgets note), its ~3.5KB gzip chunk still lands in 'Controller initial JS' and tips the repo's real, vitest-measured baseline (77.72 KB / 80 KB, confirmed by stashing this story's changes and rerunning pnpm --filter @couchcade/budgets test) over the limit -- not a size regression in the eager sense, a classification gap versus the doc's own approved budget model. Added a narrow, additive 'lazy' check kind to tooling/budgets (classify.ts's measureApp gets an optional lazyChunks matcher list that excludes a matched chunk from platformGzipBytes and tallies it in a new lazyGzipBytes bucket instead, mirroring the existing per-game exclusion; budgets.ts wires a 'lazy' BudgetCheckConfig kind with a 'path' matcher) and one new .size-limit.json entry for the Pip customiser chunk at the doc's 4KB ceiling. No existing check's kind or numbers change: 'lazy' is opt-in per path pattern and nothing else declares one. Flagged prominently for reviewer/owner scrutiny since it's a cross-cutting CI tool other in-flight stories also rely on.

Reviewer round 1 (block): (a) scope -- apps/controller/test/pips/ wasn't a declared Reference; added it (sibling stories CC-6.3/CC-6.4 declare their test/ paths separately, same convention). (b) advisory, addressed anyway: pips.md's 'Which story builds what' table assigns the join-body profile to CC-6.5 and 'When the Pip is sent' item 2 (room:welcome reconcile) is meant to run for every phone that enters a room, not only one that opens the customiser -- moved the reconcile out of use-pip-customiser.ts's constructor (which only ran if the lazy customiser panel was opened) into a new apps/controller/src/pips/reconcile.ts consumed eagerly by LobbyScreen.vue, and added the stored profile to session.ts's join() body. session/ added to References for the latter. (c) advisory, addressed: the Bald-disables-Colour hint was gated on activeTab==='colour', which selectTab() never allows while bald, so it never rendered -- moved it next to the disabled tab. (d) advisory, addressed: the lobby button copy used whether a record already existed instead of pips.md's actual rule ('Make your Pip' for players, 'Edit my Pip' for the VIP) -- switched to the vip prop.

Reviewer round 1 fixes pushed (commit 8d0bcb5), merged origin/main (CC-11.9 target-range work, no conflicts), full verify green again. Re-running story-reviewer for round 2.

Reviewer round 2 (dipsaus-ai:story-reviewer, model sonnet): PASS. Both acceptance criteria met in code, no scope violations across all References (original + amendments), no blocking or advisory findings. Reviewer independently ran the controller and budgets test suites, typecheck, and pnpm budgets, and confirmed the lazy customiser chunk (3.31/4KB) is measured separately from Controller initial JS (64.44/80KB). Traced the join()/reconcileOnEntry double-send question: no risk (join() only puts profile in the HTTP body, never sends player:profile; reconcileOnEntry is the only websocket sender and fires once per lobby mount).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added the Pip customiser to the controller lobby (apps/controller/src/pips/): a couchcade:player localStorage record (read+repair+write), a crypto-seeded randomPip/shufflePip pair, a 400ms/1-per-second debounced player:profile send rule, and a PipCustomiser.vue panel (Skin/Hair/Colour tabs, 56px radiogroup tiles, live CcPip preview, Shuffle) wired into apps/controller/src/screens/lobby/LobbyScreen.vue behind a 'Make your Pip' / 'Edit my Pip' toggle and loaded as a lazy chunk (defineAsyncComponent) per pips.md's separate 4KB budget. On mount it reconciles a stored Pip against the room's seated one (covers the known {0,0,0} join-body bug until a later story). Both acceptance criteria are met: tiles change skin/hair/hairColour and send player:profile (unit-tested end to end through the composable and the send-rule module with fake timers), and the profile persists in couchcade:player for the next room. Also extended tooling/budgets with an opt-in 'lazy' check kind (classify.ts/budgets.ts/.size-limit.json) so a dynamically-imported platform chunk is measured against its own ceiling instead of inflating Controller initial JS -- required because the existing tool folded every non-game chunk into the 80KB platform total regardless of eager/lazy, which the doc's own separate lazy-chunk budget line assumes it doesn't. pnpm check, check:deps, check:style, test and build are all green in the worktree.
<!-- SECTION:FINAL_SUMMARY:END -->
