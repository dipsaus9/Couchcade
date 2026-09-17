---
id: CC-7.3
title: Source and credit CC0 platform sounds and lobby music
status: Done
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-17 17:23'
labels:
  - story
dependencies:
  - CC-7.1
  - CC-4.9
  - CC-1.11
references:
  - apps/host/public/audio/
  - apps/host/CREDITS.md
  - tooling/assets/src/
  - tooling/assets/test/
  - docs/CREDITS.md
parent_task_id: CC-7
type: chore
ordinal: 89000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The platform has its sound effects and a lobby loop.

Type: deliverable
Branch: CC-7.3/platform-sounds
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Every token has a CC0 sound in apps/host/public/audio/
- [x] #2 apps/host/CREDITS.md lists each file with source and licence and passes the credits check
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Amend References: add tooling/assets/src/ and docs/CREDITS.md (audio.md conflict #1: credits check must also validate apps/*/CREDITS.md and collect platform entries into docs/CREDITS.md).
2. Source the 6 token sounds + lobby loop from the audio.md CC0 shortlist (Freesound hq preview OGG / Kenney pack / OpenGameArt), preferring each row's Primary per the doc's own notes; verify CC0 on the source page.
3. Cut/fade/level/encode each to OGG Vorbis with ffmpeg, named <token>.ogg or lobby-loop.ogg, into apps/host/public/audio/. celebrate.ogg mixes the notes + crowd sources.
4. Write apps/host/CREDITS.md (asset, author, source, licence) for every file.
5. Extend tooling/assets/src/credits.ts to also read apps/*/CREDITS.md and add a "Platform" section to docs/CREDITS.md; update credits.test.ts; regenerate docs/CREDITS.md via the credits script.
6. Record the apps/host/public/audio/ folder's total size against the 500KB/150KB/350KB budget in task notes.
7. Verify: pnpm check, pnpm test, pnpm build (per orchestrator override), plus story Verify.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test

apps/host/public/audio/ totals ~303 KB (press 7.2KB, ui 4.6KB, scene 10.0KB, your-turn 13.3KB,
celebrate 44.1KB, foul 9.1KB = 88.3KB for the six tokens; lobby-loop.ogg 214.2KB), inside the
500KB/150KB/350KB budgets in docs/architecture/audio.md. All primaries from the CC0 shortlist were
used (Freesound hq preview OGG, Kenney Digital Audio pack, OpenGameArt Happy Chiptunes Collection),
downloaded and licence-checked on source pages, then cut/faded/levelled/encoded to OGG Vorbis with
ffmpeg. Extended tooling/assets/src/credits.ts (References amended to include tooling/assets/src/
and docs/CREDITS.md per audio.md conflict #1) so the credits check also validates apps/*/CREDITS.md
and collects entries into a shared "Platform" section of docs/CREDITS.md.

Product picks for the owner (doc left "listen before committing" to CC-7.3; this agent has no
ears, so picks follow the shortlist's own primary/backup notes plus ffmpeg level-matching instead
of a literal listen):
- foul.ogg and your-turn.ogg use the shortlist's PRIMARY sources, levelled down further
  (-7.7dB and -4dB respectively) per the shortlist's own notes that they're loud/shrill. If the
  CC-7.4 manual TV check (audio.md Testing item 7) says these still read wrong, swap to the
  shortlist's backups (hypocore buzzer.wav / SpliceSound referee whistle).
- celebrate.ogg's "notes" layer uses Kenney's threeTone2.ogg (the shortlist's primary) over the
  Freesound backup, since the shortlist itself flags the backup's origin as less certain.
- lobby-loop.ogg is the shortlist's primary (Holizna "Adventure Begins Loop"), cut 0s-22.154s
  (12 bars at the doc's approved 130 BPM). This agent's own `aubio tempo` measured 101.46 BPM on
  the same file, not 130 BPM; could not resolve the discrepancy without listening. Followed the
  doc's owner-approved 130 BPM figure for the cut length. Flagged for the CC-7.4 manual check to
  confirm the loop's tempo and seam by ear.

Review round 1 (dipsaus-ai:story-reviewer, sonnet): verdict block. Both acceptance criteria met
(AC1: all 6 token files + lobby-loop.ogg present, correctly named, within budget; AC2:
apps/host/CREDITS.md well-formed, credits.ts extension verified correct, docs/CREDITS.md Platform
section matches). Sole blocking finding: scopeViolation on tooling/assets/test/credits.test.ts,
which wasn't in the declared References (only tooling/assets/src/ was). Fixed by amending
References to add tooling/assets/test/ (re-passed all refs) — the test file is a necessary
companion to the credits.ts extension it covers, not new scope. No code changes needed;
re-reviewing.

Review round 2 (dipsaus-ai:story-reviewer, sonnet): verdict pass. Both acceptance criteria met, no scope violations, no findings.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Sourced and credited the six platform token sounds (press, ui, scene, your-turn, celebrate, foul)
plus the lobby loop into apps/host/public/audio/, all CC0 from the docs/architecture/audio.md
shortlist (Freesound, Kenney, OpenGameArt), cut/faded/levelled/encoded to OGG Vorbis with ffmpeg.
apps/host/CREDITS.md credits every file (asset, author, source, licence). Extended
tooling/assets/src/credits.ts (per the doc's conflict #1) to also validate apps/*/CREDITS.md and
collect app entries into a shared "Platform" section of docs/CREDITS.md, with test coverage in
tooling/assets/test/credits.test.ts. Total audio folder size ~303 KB, inside the 500 KB/150 KB/
350 KB budgets. Reviewer passed round 2 (round 1 blocked on a References gap for the test file,
fixed by amending References). No playback wiring — that's CC-7.4.
<!-- SECTION:FINAL_SUMMARY:END -->
