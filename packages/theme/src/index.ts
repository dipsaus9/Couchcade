/**
 * `@couchcade/theme`: the house style tokens and their generated outputs.
 *
 * - `@couchcade/theme/generate`: `toCssVars`, `toPhaserColor` (also re-exported here)
 * - `@couchcade/theme/scenes`: scene palettes, registered with Vite's `import.meta.glob`
 */
export * from "./tokens.ts";
export * from "./generate/index.ts";
export * from "./pips/index.ts";
