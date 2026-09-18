import type { InputChannel } from "@couchcade/game-sdk/contract";
import type { StrikeNightInput } from "../../src/shared/input.ts";

/**
 * A fake `InputChannel` for `createBowl` and `Controller.vue` tests: every `stream` and `fire`
 * call sends at once, in order, with no hz gating or relay packing (the channel's own concern,
 * tested where `createInputChannel` lives). `timestamps` maps each sent input (by reference) to
 * the `eventTimeStamp` it was sent with, for tests that check timing. `path` is fixed at
 * `"direct"`.
 */
export function createTestChannel(): {
  channel: InputChannel<StrikeNightInput>;
  sent: StrikeNightInput[];
  timestamps: Map<StrikeNightInput, number | undefined>;
} {
  const sent: StrikeNightInput[] = [];
  const timestamps = new Map<StrikeNightInput, number | undefined>();
  const lastByType = new Map<string, StrikeNightInput>();
  const channel: InputChannel<StrikeNightInput> = {
    stream(input, t) {
      lastByType.set(input.type, input);
      sent.push(input);
      timestamps.set(input, t);
    },
    fire(input, t) {
      sent.push(input);
      timestamps.set(input, t);
    },
    last(type) {
      return (lastByType.get(type) ?? null) as Extract<
        StrikeNightInput,
        { type: typeof type }
      > | null;
    },
    clear() {},
    path: "direct",
  };
  return { channel, sent, timestamps };
}
