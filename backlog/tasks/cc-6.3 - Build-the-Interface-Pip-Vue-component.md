---
id: CC-6.3
title: Build the Interface Pip Vue component
status: Done
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-17 22:47'
labels:
  - story
dependencies:
  - CC-6.2
  - CC-4.4
references:
  - packages/ui/src/pips/
  - packages/theme/src/pips/
  - packages/ui/test/pips/
  - packages/theme/test/pips.test.ts
  - packages/ui/src/index.ts
  - packages/theme/src/index.ts
parent_task_id: CC-6
type: feature
ordinal: 83000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Phones and menus can render a Pip.

Type: deliverable
Branch: CC-6.3/interface-pip-component
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 <Pip :profile> renders all parts with outline weight and player colour jersey
- [x] #2 Component tests cover each hairstyle
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1) theme/src/pips/: PipElement/PipPaint data types, pipViewBox, pipHead, pipJersey(+neck), pipHairBack/Front per hairstyle, pipEyes/pipMouth per expression, skin/hair/hairColour screen-reader names; re-export from theme/src/index.ts. 2) ui/src/pips/CcPip.vue: renders full/head crop, resolves paint roles to CSS vars (--cc-skin-N/--cc-hair-N/--cc-player-<id>/--cc-chalk/--cc-ink), draws jersey (player colour + chalk V-neck + chalk seat-shape from ../components/shapes.ts) or plain chalk jersey for audience (slot null, no emblem), hair back/front layers, face per expression, outline stroke-width formula (outline px * viewBoxWidth / size), role=img+aria-label or aria-hidden; export via ui/src/pips/index.ts and ui/src/index.ts. 3) Tests: theme/test/pips.test.ts (list lengths/ids match @couchcade/utils pipParts, hex format); ui/test/pips/cc-pip.test.ts (all 8 hairstyles render, player colour jersey, audience fallback, head vs full crop, outline weight phone/tv, axe).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test

Doc amendment (docs/architecture/pips.md 'Found while writing this spec' item 3): added packages/theme/src/pips/ to References for the shared Interface Pip vector geometry (ui and stage can't import each other). Also added the barrel files packages/ui/src/index.ts and packages/theme/src/index.ts (re-exporting the new pips module, same pattern CC-6.2 used for packages/utils/src/index.ts) and explicit test paths packages/ui/test/pips/ and packages/theme/test/pips.test.ts, re-passing the original packages/ui/src/pips/ reference.

Implemented as CcPip (doc item 3 renames <Pip> -> CcPip) in packages/ui/src/pips/CcPip.vue, drawing part geometry from a new packages/theme/src/pips/ module (head, jersey+chalk V-neck+chalk seat-shape mark, hair back/front per hairstyle, 4 expressions), exported from both packages' root index.ts. pnpm budgets: CcPip isn't imported by any app screen yet (that lands in CC-6.5/CC-6.6), so its own bundle cost isn't isolated yet; controller initial JS still passes at 57.41/80 KB. Full pnpm check, check:deps, test and build are green on the merged tree.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Built CcPip (packages/ui/src/pips/CcPip.vue), the vector Interface Pip for phones, menus and TV overlays, on the shared part geometry from a new packages/theme/src/pips/ module (head, jersey with a Chalk V-neck and Chalk seat-shape chest mark, hair back/front layers per hairstyle, four expressions), so @couchcade/ui and the future @couchcade/stage scoreboard heads draw from one source without importing each other. CcPip renders full or head crops, resolves profile/slot to house CSS variables, keeps the outline exactly 3px (phone) / 4px (TV) at any rendered size, falls back to a plain Chalk jersey with no emblem for audience Pips, and is role=img/aria-hidden per the label prop. Doc-review follow-up applied: References amended (doc pips.md item 3) to add packages/theme/src/pips/ plus the two barrel files and explicit test paths. pnpm check, check:deps, test and build are green on the merged tree.
<!-- SECTION:FINAL_SUMMARY:END -->
