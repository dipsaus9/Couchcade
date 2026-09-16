/**
 * `@font-face` rules for the two self-hosted house-style fonts (CC-4.3, docs/HOUSE_STYLE.md
 * "Type"): Fredoka for everything people read, Pixelify Sans for numbers, scores, timers, room
 * codes and callouts. Both fonts are SIL Open Font License 1.1 with no reserved font names
 * (docs/TECH_STACK.md, "Fonts"); the subsetted WOFF2 files and each font's OFL.txt live in
 * packages/theme/fonts/<font>/ (tooling/fonts/ generates them - see that package for how to
 * re-run the subset).
 *
 * `font.ui` / `font.pixel` in tokens.ts are the *fallback stacks* used everywhere in the app
 * (`var(--cc-font-ui)`); this only supplies the first name in each stack from our own origin, so
 * no request ever reaches Google Fonts or any other CDN (the CSP in
 * apps/server/src/security/headers.ts allows only `font-src 'self'`).
 *
 * The URLs are absolute (`/fonts/...`) and unhashed on purpose: apps/controller and apps/host
 * both serve them at the same fixed paths in dev and at build (see their vite.config.ts), and
 * apps/server merges controller's build output into the site root and host's under `/host/`, so
 * an absolute path resolves the same way regardless of which app's page requested it.
 */
export const FONT_FACE_CSS = `@font-face {
  font-family: "Fredoka";
  src: url("/fonts/fredoka.woff2") format("woff2-variations");
  font-weight: 500 700;
  font-style: normal;
  font-display: swap;
}

@font-face {
  font-family: "Pixelify Sans";
  src: url("/fonts/pixelify-sans.woff2") format("woff2");
  font-weight: 700;
  font-style: normal;
  font-display: swap;
}
`;

/** The `@font-face` stylesheet text (a constant today; a function so callers never assume that). */
export function toFontFaceCss(): string {
  return FONT_FACE_CSS;
}
