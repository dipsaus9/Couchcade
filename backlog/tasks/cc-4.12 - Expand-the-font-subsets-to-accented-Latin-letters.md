---
id: CC-4.12
title: Expand the font subsets to accented Latin letters
status: In Progress
assignee: []
created_date: '2026-09-17 09:02'
updated_date: '2026-09-17 10:39'
labels:
  - story
dependencies:
  - CC-4.3
references:
  - tooling/fonts/
  - packages/theme/fonts/
  - packages/theme/test/fonts.test.ts
parent_task_id: CC-4
type: chore
ordinal: 207000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Player names with accents (Renée, Chloë, Zoë, Jürgen) show correctly on the TV and phones instead of boxes, as security.md's name allowlist requires.

Type: deliverable
Branch: CC-4.12/accented-font-subset
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 tooling/fonts subsets Fredoka and Pixelify Sans to Basic Latin plus the Latin-1 Supplement and Latin Extended-A letters that docs/architecture/security.md allows in names
- [x] #2 The two WOFF2 files still total at most 40 KB and pnpm budgets passes
- [x] #3 A test renders every allowed name character in both fonts without falling back to .notdef
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Probe upstream Fredoka and Pixelify Sans cmaps (harfbuzzjs face.collectUnicodes()) for Latin-1 Supplement and Latin Extended-A coverage before touching charset.ts, since subset-font silently drops codepoints the source font lacks.
2. Confirm in HOUSE_STYLE.md that player names only ever render in Fredoka (Pixelify Sans is numbers/scores/timers/room codes/callouts, uppercase-only) so only FREDOKA_TEXT needs the accented letters.
3. Expand tooling/fonts/src/charset.ts: FREDOKA_TEXT += full Latin-1 Supplement letters (62/62 upstream) + the Latin Extended-A letters Fredoka actually has (10/128: i-dotless Lstroke Oeligature Scaron Ydiaeresis Zcaron). Leave PIXELIFY_TEXT untouched.
4. Re-run pnpm fonts:subset, confirm the two WOFF2s stay under the 40 KB budget.
5. Add an AC3 test to packages/theme/test/fonts.test.ts that decodes the committed fredoka.woff2 (fontverter) and checks its harfbuzzjs cmap for every character FREDOKA_TEXT's accented portion claims, plus the owner's named examples.
6. Add harfbuzzjs + fontverter as packages/theme devDependencies (already subset-font's own deps, added to the pnpm-workspace.yaml catalog) since packages/theme needs to import them directly under pnpm's strict isolation.
7. Verify: pnpm check, pnpm test, pnpm build, pnpm budgets, pnpm check:deps, pnpm check:style all green.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Owner decision 2026-09-17: allow accented names; fonts must cover them (CC-4.3 subset was ASCII only, 20,588 B used of 40,960).

Findings (probed upstream cmaps with harfbuzzjs before writing tooling/fonts/src/charset.ts):
- Upstream Fredoka (CC-4.3's pinned google/fonts commit) has all 62 Latin-1 Supplement letters but only 10 of 128 Latin Extended-A letters (ı Ł ł Œ œ Š š Ÿ Ž ž). The other 118 (Polish ą ć ę, Czech/Baltic macrons/carons, etc.) simply aren't in the font file; subset-font silently drops any requested codepoint the source doesn't have. A name using one of those 118 falls back to the next family in --font-ui (Nunito, Arial Rounded MT Bold, system-ui, sans-serif) rather than showing a box, but not in Fredoka's own voice. Flagged for CC-2.4 to decide whether its allowlist should match this exact 10-letter set or accept the fallback for the gap.
- Upstream Pixelify Sans has near-full coverage (62/62 Latin-1 Supplement, 126/128 Extended-A) but HOUSE_STYLE.md ("Type") and the "Chalk pill" section confirm names only ever render in Fredoka - Pixelify Sans is numbers/scores/timers/room codes/callouts only, uppercase-only, never a name. So AC1's charset expansion only applies to FREDOKA_TEXT; PIXELIFY_TEXT is unchanged from CC-4.3 (adding unused accented glyphs there would only cost budget). AC3's coverage test therefore checks Fredoka's committed WOFF2 cmap only.
- The owner's 2026-09-17 examples (Renee, Chloe, Zoe with diaeresis, Jurgen with umlaut) are all Latin-1 Supplement and are fully covered.
- Result: fredoka.woff2 grew from 17,464 B to 22,136 B; pixelify-sans.woff2 unchanged at 3,124 B; total 25,260 B (was 20,588 B), well under the 40 KB budget (61.7% used, pnpm budgets: Controller fonts 24.67 KB / 40.00 KB PASS).
- Added harfbuzzjs + fontverter (already subset-font's own dependencies, pnpm-workspace.yaml catalog) as packages/theme devDependencies to read the committed WOFF2's cmap directly in the AC3 test, instead of adding a new font-inspection library.
<!-- SECTION:NOTES:END -->
