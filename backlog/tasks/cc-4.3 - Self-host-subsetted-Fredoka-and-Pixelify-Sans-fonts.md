---
id: CC-4.3
title: Self-host subsetted Fredoka and Pixelify Sans fonts
status: In Progress
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 23:16'
labels:
  - story
dependencies:
  - CC-4.2
references:
  - packages/theme/fonts/
  - packages/theme/src/generate/fonts.ts
  - packages/theme/src/generate/index.ts
  - packages/theme/test/fonts.test.ts
  - apps/controller/vite.config.ts
  - apps/host/vite.config.ts
  - tooling/fonts/
  - package.json
parent_task_id: CC-4
type: chore
ordinal: 63000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Both fonts load from our own origin within the 40 KB budget.

Type: deliverable
Branch: CC-4.3/self-hosted-fonts
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Two WOFF2 files total ≤ 40 KB
- [x] #2 OFL.txt ships next to the font files
- [x] #3 The theme CSS declares @font-face with the house style fallback stacks
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. tooling/fonts/: a new tool package with a subset-font (harfbuzzjs WASM, no python) script that fetches the upstream OFL Fredoka (variable wght 300-700 + wdth 75-125) and Pixelify Sans (variable wght 400-700) TTFs from google/fonts, pinned to one commit SHA, subsets each to an English charset (letters, digits, standard punctuation, curly quotes, en/em dash, ellipsis, x00D7), and writes WOFF2 + OFL.txt to packages/theme/fonts/<font>/. Fredoka keeps its wght axis narrowed to 500-700 (the two weights HOUSE_STYLE/typeScale actually use) and wdth pinned to 100 (variable font, smallest for 2 weights); Pixelify Sans is pinned to a single wght 700 instance (typeScale only ever uses pixel 700). 2. Commit the generated WOFF2s + OFL.txt files (verified once, offline from then on). 3. packages/theme/src/generate/fonts.ts: a new toFontFaceCss()/FONT_FACE_CSS export with the two @font-face rules (font-display: swap, font-family "Fredoka"/"Pixelify Sans", src url(/fonts/...)), re-exported from generate/index.ts and thus from @couchcade/theme. 4. apps/controller/vite.config.ts and apps/host/vite.config.ts: extend the existing themeCss() virtual-module plugin to prepend toFontFaceCss(), and add a themeFonts() plugin (mirrors themeCss(): a dev middleware + build generateBundle emitFile) that serves the two committed WOFF2 files at the fixed unhashed paths /fonts/fredoka.woff2 and /fonts/pixelify-sans.woff2, in both apps so the URLs resolve in dev (whichever app's own server runs) and in the built dist (apps/server merges controller's dist to dist/public and host's to dist/public/host; absolute /fonts/... paths resolve from the origin root either way). 5. No change needed to apps/server/src/security/headers.ts: font-src 'self' already covers this. 6. Verify: pnpm check, pnpm test, pnpm build, then a headless-Chromium check (Playwright, ad hoc script, not committed) that both apps load with zero CSP violations and document.fonts reports both families 'loaded'.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test

Amended References at pickup (no owner to ask, per worker brief): added packages/theme/src/generate/fonts.ts + index.ts (the @font-face CSS), packages/theme/test/fonts.test.ts, apps/controller/vite.config.ts + apps/host/vite.config.ts (serve the two WOFF2 files at fixed /fonts/*.woff2 paths in dev and build, mirroring the existing themeCss() virtual-module pattern from CC-2.7), tooling/fonts/ (the subsetting script + its package, new tool), and root package.json (new fonts:subset script line, following the tooling/<tool> owns a root script convention already used by assets:recolour/check:style/check:deps). pnpm-workspace.yaml's catalog gets a subset-font entry and pnpm-lock.yaml updates as implied bookkeeping, excluded from the reviewer diff per the worker brief, not added to References.

Re-subsetting: run 'pnpm fonts:subset' (delegates to tooling/fonts, node src/cli.ts) any time the charset or weights change; it downloads the pinned upstream OFL variable fonts (google/fonts commit 92345ac0, ofl/fredoka and ofl/pixelifysans) over the network and overwrites packages/theme/fonts/*/. Uses subset-font (harfbuzzjs WASM), no python/fonttools. Result: fredoka.woff2 17,464 B (wght 500-700 variable, wdth pinned to 100) + pixelify-sans.woff2 3,124 B (wght pinned to 700, static) = 20,588 B total, well under the 40 KB budget (AC1).

Cross-story flag for CC-2.4 (player-name validation, not yet built): docs/architecture/security.md 'Player names' says the name allowlist 'must match the glyphs in the subsetted fonts (CC-4.x)'. This story's charset is English-only Basic Latin (per its own brief), with no Latin-1 Supplement / Latin Extended-A accented letters - so a name like 'Renée' would show tofu boxes on the TV today. Recommendation for whoever picks up CC-2.4: either (a) restrict the name allowlist to plain ASCII letters to match this font subset, or (b) file a follow-up to re-run tooling/fonts/ with an expanded charset (plenty of budget headroom: 20,588 of 40,960 bytes used) before CC-2.4 ships accented-letter support. Did not expand scope here since it wasn't in this story's brief.
<!-- SECTION:NOTES:END -->
