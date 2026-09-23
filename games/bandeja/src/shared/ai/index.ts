/**
 * Automatic player movement and the real CPU partner (docs/games/bandeja.md rule 3 and rule 10;
 * CC-23.8). Everything here is a pure function of `BandejaState`, reused by `rules.ts` to advance
 * `state.positions` every tick and to launch the CPU's own returns.
 */
export * from "./cpu.ts";
export * from "./landing.ts";
export * from "./movement.ts";
export * from "./positions.ts";
