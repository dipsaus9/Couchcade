import type { InputChannel } from "@couchcade/game-sdk/contract";
import type { BandejaInput } from "../../src/shared/input.ts";

/**
 * A fake `InputChannel` for `createSwingController` and `Controller.vue` tests: every `fire` call
 * sends at once, in order, with no hz gating or relay packing (the channel's own concern, tested
 * where `createInputChannel` lives). `timestamps` maps each sent input (by reference) to the
 * `eventTimeStamp` it was sent with, for tests that check timing. `path` is fixed at `"direct"`.
 */
export function createTestChannel(): {
  channel: InputChannel<BandejaInput>;
  sent: BandejaInput[];
  timestamps: Map<BandejaInput, number | undefined>;
} {
  const sent: BandejaInput[] = [];
  const timestamps = new Map<BandejaInput, number | undefined>();
  const lastByType = new Map<string, BandejaInput>();
  const channel: InputChannel<BandejaInput> = {
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
      return (lastByType.get(type) ?? null) as Extract<BandejaInput, { type: typeof type }> | null;
    },
    clear() {},
    path: "direct",
  };
  return { channel, sent, timestamps };
}
