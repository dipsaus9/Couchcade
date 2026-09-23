import type { InputChannel } from "@couchcade/game-sdk/contract";
import type { PuttClubInput } from "../../src/shared/input.ts";

/**
 * A fake `InputChannel` for `createPuttController` and `Controller.vue` tests: every `stream` and
 * `fire` call sends at once, in order, with no hz gating or relay packing (the channel's own
 * concern, tested where `createInputChannel` lives). `last` reflects the newest value given to
 * `stream`, exactly as the real channel does. `timestamps` maps each sent input (by reference) to
 * the `eventTimeStamp` it was sent with, for tests that check timing. `path` defaults to `"direct"`;
 * pass `"relay"` or `"off"` for tests that check `lock`'s path-aware playback delay (CC-11.10).
 */
export function createTestChannel(path: InputChannel<PuttClubInput>["path"] = "direct"): {
  channel: InputChannel<PuttClubInput>;
  sent: PuttClubInput[];
  timestamps: Map<PuttClubInput, number | undefined>;
} {
  const sent: PuttClubInput[] = [];
  const timestamps = new Map<PuttClubInput, number | undefined>();
  const lastByType = new Map<string, PuttClubInput>();
  const channel: InputChannel<PuttClubInput> = {
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
      return (lastByType.get(type) ?? null) as Extract<PuttClubInput, { type: typeof type }> | null;
    },
    clear() {},
    path,
  };
  return { channel, sent, timestamps };
}
