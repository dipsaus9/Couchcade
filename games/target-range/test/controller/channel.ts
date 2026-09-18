import type { InputChannel } from "@couchcade/game-sdk/contract";
import type { TargetRangeInput } from "../../src/shared/input.ts";

/**
 * A fake `InputChannel` for `createShotAim` and `Controller.vue` tests: every `stream` and `fire`
 * call sends at once, in order, with no hz gating or relay packing (the channel's own concern,
 * tested where `createInputChannel` lives). `last` reflects the newest value given to `stream`,
 * exactly as the real channel does. `timestamps` maps each sent input (by reference) to the
 * `eventTimeStamp` it was sent with, for tests that check timing. `path` is fixed at `"direct"`.
 */
export function createTestChannel(): {
  channel: InputChannel<TargetRangeInput>;
  sent: TargetRangeInput[];
  timestamps: Map<TargetRangeInput, number | undefined>;
} {
  const sent: TargetRangeInput[] = [];
  const timestamps = new Map<TargetRangeInput, number | undefined>();
  const lastByType = new Map<string, TargetRangeInput>();
  const channel: InputChannel<TargetRangeInput> = {
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
        TargetRangeInput,
        { type: typeof type }
      > | null;
    },
    clear() {},
    path: "direct",
  };
  return { channel, sent, timestamps };
}
