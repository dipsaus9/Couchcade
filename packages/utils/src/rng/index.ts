/**
 * Seeded random numbers for game rules. The same seed always gives the same sequence, on every
 * device, so games stay replayable and testable.
 *
 * The generator is mulberry32: one 32-bit integer of state, a few integer operations per draw.
 * It is not cryptographically secure. Never use it for secrets, tickets or anything a player must
 * not be able to predict.
 *
 * The state is a plain number, so it fits in a game's JSON state. Store `rng.state` in `TState`
 * and call `createRng(state.rngState)` on the next tick to carry on with the same sequence.
 */

/** A seed or saved state. Any number works; it is reduced to an unsigned 32-bit integer. */
export type RngState = number;

export interface Rng {
  /** Current state. `createRng(rng.state)` continues the sequence from this point. */
  readonly state: RngState;
  /** A float in [0, 1). */
  next(): number;
  /** An integer in [min, max], both inclusive. */
  int(min: number, max: number): number;
  /** One item of a non-empty array. */
  pick<T>(items: readonly T[]): T;
  /** A shuffled copy of the array. The input is not changed. */
  shuffle<T>(items: readonly T[]): T[];
}

const UINT32_RANGE = 2 ** 32;

/** Creates a generator from a seed, or from a saved `rng.state`. */
export function createRng(seed: RngState): Rng {
  let state = Number.isFinite(seed) ? seed >>> 0 : 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let z = state;
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    return ((z ^ (z >>> 14)) >>> 0) / UINT32_RANGE;
  };

  const int = (min: number, max: number): number => {
    if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || min > max) {
      throw new RangeError(`int(min, max) needs integers with min <= max, got ${min} and ${max}`);
    }
    const span = max - min + 1;
    if (span > UINT32_RANGE) {
      throw new RangeError(`int(min, max) supports at most 2^32 values, got ${span}`);
    }
    return min + Math.floor(next() * span);
  };

  return {
    get state() {
      return state;
    },
    next,
    int,
    pick<T>(items: readonly T[]): T {
      if (items.length === 0) {
        throw new RangeError("pick() needs at least one item");
      }
      return items[int(0, items.length - 1)] as T;
    },
    shuffle<T>(items: readonly T[]): T[] {
      const copy = [...items];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = int(0, i);
        [copy[i], copy[j]] = [copy[j] as T, copy[i] as T];
      }
      return copy;
    },
  };
}
