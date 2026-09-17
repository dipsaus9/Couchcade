---
id: CC-2.9
title: Keep rude words out of room codes
status: Done
assignee: []
created_date: '2026-09-17 09:02'
updated_date: '2026-09-17 10:37'
labels:
  - story
dependencies:
  - CC-1.7
references:
  - packages/utils/src/room-code/
  - packages/utils/test/
parent_task_id: CC-2
type: feature
ordinal: 208000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A room code shown big on the TV never spells a rude word in Dutch or English.

Type: deliverable
Branch: CC-2.9/room-code-blocklist
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 roomCode() in packages/utils/src/room-code/ redraws when the 4-letter code is on a small NL + EN blocklist, for both the crypto and the seeded RNG paths
- [x] #2 The blocklist lives next to roomCode(), only contains words that can be built from the room-code alphabet (A-Z without I and O), and is covered by a test
- [x] #3 A fast-check property shows roomCode() never returns a blocked code and still only returns valid codes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1) Add packages/utils/src/room-code/blocklist.ts: a small NL+EN blocklist of 4-letter rude/offensive words spellable with ROOM_CODE_ALPHABET (A-Z minus I,O), including a few common letter-substitution variants (Y for I, U for O) for words that otherwise contain I/O, as an uppercase readonly array (no per-word comments). 2) In room-code/index.ts, build a Set from the blocklist and change roomCode() to loop (redraw) until the generated code is not in the set, for both the crypto default path and the injected seeded-RNG path. 3) Tests in packages/utils/test/room-code.test.ts: (a) every blocklist entry is exactly ROOM_CODE_LENGTH letters and built only from ROOM_CODE_ALPHABET characters; (b) a directed test with a mock Rng that first yields a blocked code then a valid one, proving roomCode() redraws; (c) a fast-check property over seeds proving roomCode(createRng(seed)) is never a blocked code and isRoomCode() is always true. No new deps, no security.md edit (References do not include it).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Owner decision 2026-09-17 (security.md decision 20).

Implemented: packages/utils/src/room-code/blocklist.ts (15-entry NL+EN blocklist, uppercase, no per-word comments, all spellable with ROOM_CODE_ALPHABET). roomCode() in room-code/index.ts now loops/redraws until the code is not in the blocklist Set, for both the crypto path and the injected seeded-RNG path. Tests added to room-code.test.ts: blocklist shape/spellability, a directed redraw test with a mock Rng, and a fast-check property over seeds proving roomCode() never returns a blocked code and isRoomCode() is always true; plus a crypto-path loop check. No new runtime dependency (tier 0 preserved); fast-check was already a devDependency. security.md left unchanged per the story's References.

story-reviewer verdict (round 1): pass. All 3 acceptance criteria met, no scope violations. Advisory findings (non-blocking): (1) crypto-path redraw is only checked statistically (5000 draws vs 15 blocked codes out of 331,776); the seeded path already has a deterministic forced-redraw test - left as-is, statistical coverage is adequate for the crypto path given it cannot be seeded. (2) no automated link between the blocklist and security.md decision 20 beyond the doc comment - out of scope for this story (security.md not in References), left unchanged as instructed.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
roomCode() in packages/utils/src/room-code/index.ts now redraws (a do-while loop) until the generated 4-letter code is not on a small new NL+EN blocklist of 15 rude/offensive words, on both the default crypto path and the injected seeded-RNG path. The blocklist lives next to roomCode() in packages/utils/src/room-code/blocklist.ts as a plain uppercase array (no per-word commentary), built only from ROOM_CODE_ALPHABET (A-Z minus I/O) - direct spellings (FUCK, CUNT, TWAT, SLUT, WANK, ARSE, SLAG, CUCK) plus a few common Y-for-I / U-for-O substitution spellings for words that otherwise contain I or O (SHYT, DYCK, PYSS, HUER) and Dutch entries (TRUT, TEEF, REET, HUER). Tests in packages/utils/test/room-code.test.ts cover: every blocklist entry is exactly 4 letters and alphabet-only with no duplicates; a directed mock-Rng test proving the seeded path actually redraws past a forced blocked code; a fast-check property over seeds proving roomCode() never returns a blocked code and isRoomCode() is always true; and a 5000-draw loop proving the same for the crypto default path. No runtime dependency was added (tier 0 preserved; fast-check was already a devDependency). security.md was left unchanged, as instructed - it already records this as decision 20 and is not in this story's References. Verified: pnpm check, pnpm test and pnpm build all green repo-wide; independent story-reviewer verdict: pass (round 1), all 3 acceptance criteria met, no scope violations.
<!-- SECTION:FINAL_SUMMARY:END -->
