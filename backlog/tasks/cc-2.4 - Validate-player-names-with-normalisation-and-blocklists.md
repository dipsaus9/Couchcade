---
id: CC-2.4
title: Validate player names with normalisation and blocklists
status: Done
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-17 15:55'
labels:
  - story
dependencies:
  - CC-2.3
  - CC-4.12
references:
  - packages/utils/src/names/
  - apps/server/src/security/names.ts
  - apps/server/src/api/
  - packages/utils/src/index.ts
  - packages/utils/test/names.test.ts
  - apps/server/test/api.test.ts
  - apps/controller/src/join/form.ts
  - apps/controller/src/join/copy.ts
  - apps/controller/test/form.test.ts
  - tooling/fonts/src/charset.ts
  - tooling/fonts/test/charset.test.ts
  - tooling/fonts/package.json
  - packages/theme/fonts/fredoka/fredoka.woff2
  - packages/theme/test/fonts.test.ts
  - packages/theme/package.json
parent_task_id: CC-2
type: feature
ordinal: 46000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Names are safe to show on a TV at a party.

Type: deliverable
Branch: CC-2.4/player-name-rules
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Names are 1–12 characters after NFKC normalisation and match a character allowlist
- [x] #2 Names on the NL + EN blocklist are rejected with a referee-voice message
- [x] #3 Property tests (fast-check) cover normalisation
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. packages/utils/src/names/: NAME_CHARACTERS allowlist (A-Z a-z, 62 Latin-1 Supplement letters, the 10 Latin Extended-A letters Fredoka ships, digits, space ' - . _), normaliseName (NFKC, trim, collapse spaces), nameLength in code points, checkName returning the normalised name or a problem (empty, too-long, character, no-letter, blocked), foldName (lowercase, strip accents, leetspeak swaps, letters only, collapse repeats) and NL + EN blocklists (anywhere vs whole-name words) per security.md.
2. Tests: example tests + fast-check properties (normalisation idempotent, accepted names 1-12 code points, never admits a code point outside the allowlist, fold output letters only), blocklist variants generated from the lists, ordinary NL/EN names pass.
3. Rule 5: tooling/fonts charset.ts derives Fredoka's name glyphs from the utils allowlist (adds the missing underscore, re-subset), packages/theme fonts test asserts allowlist is a subset of the committed Fredoka cmap.
4. apps/server/src/security/names.ts wraps checkName; api/join.ts step 3 uses it (order unchanged: after body schema, before Turnstile).
5. Controller join form uses the utils function for instant feedback with referee-voice hints.
6. Amend References with the glue paths via the CLI.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test

Scope amended (References) with glue paths: packages/utils/src/index.ts (root export), utils/server/controller tests, apps/controller/src/join/form.ts + copy.ts (phone runs the same utils checkName, referee-voice hints per problem), and the font glue for security.md rule 5: tooling/fonts/src/charset.ts now builds Fredoka's subset from the utils allowlist (single source), tooling/fonts + packages/theme package.json gain @couchcade/utils as a devDependency, packages/theme/test/fonts.test.ts asserts allowlist is a subset of the committed Fredoka cmap. That test found the underscore (allowed by security.md) missing from the CC-4.12 subset, so fonts:subset was re-run: fredoka.woff2 22,136 -> 22,168 B, pixelify unchanged, total 25,292 B of 40,960 B (pnpm budgets: Controller fonts 24.70 KB / 40.00 KB PASS).
Decisions: allowlist = A-Z a-z, the 62 Latin-1 Supplement letters, only the 10 Latin Extended-A letters Fredoka has (ı Ł ł Œ œ Š š Ÿ Ž ž), digits, space ' - . _. Only U+0020 runs collapse (NFKC already maps NBSP/wide spaces to it), so tab, newline and U+FEFF inside a name are refused rather than silently turned into spaces. Blocklist entries are stored folded; long words match anywhere, short words only the whole folded name; words whose fold hits a normal name (boob -> bob, coon -> con, dick) are left out, Kick is the backstop.

Review gate (dipsaus-ai:story-reviewer), round 1: pass. AC1-3 met, no scope violations. Advisory: security.md rule 3 / decision 10 still say 'Latin Extended-A letters' in general while the allowlist keeps only the 10 Fredoka can draw (rule 5); docs/ is outside References, follow-up docs wording change.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Player names now follow security.md 'Player names' on both ends. @couchcade/utils/names (tier 0, no deps) normalises with NFKC, trim and single spaces, counts 1-12 code points, allows A-Z a-z, the 62 Latin-1 Supplement letters, the 10 Latin Extended-A letters Fredoka draws (ı Ł ł Œ œ Š š Ÿ Ž ž), digits, space and ' - . _, needs a letter or digit, and checks compact NL + EN blocklists on a folded form (lowercase, accents stripped, leetspeak swaps, letters only, repeats collapsed; long words anywhere, short words whole-name only). The Worker checks it at join step 3 via apps/server/src/security/names.ts (after body schema, before Turnstile) and returns 400 name-not-allowed; the phone join form runs the same checkName for instant referee-voice hints ('That name's a foul. Pick another one.'). Rule 5: tooling/fonts builds Fredoka's subset from the utils allowlist and packages/theme/test/fonts.test.ts asserts the allowlist is a subset of the committed cmap; this caught the missing underscore, so the subset was regenerated (fredoka.woff2 22,136 -> 22,168 B, fonts budget 24.70/40 KB PASS). fast-check properties cover idempotent normalisation, the length bound, the allowlist and fold output. Verify: pnpm check, test, build, check:deps, check:style, budgets green. Reviewer pass round 1.
<!-- SECTION:FINAL_SUMMARY:END -->
