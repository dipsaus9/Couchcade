import { afterEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPlayers } from "@couchcade/game-sdk/testing";
import type { Player } from "@couchcade/game-sdk/contract";
import Controller from "../../src/controller/Controller.vue";
import { inputSchema } from "../../src/shared/input.ts";
import type { QuickDrawInput } from "../../src/shared/input.ts";
import type {
  QuickDrawResultView,
  QuickDrawRoundView,
  QuickDrawScreen,
} from "../../src/shared/view.ts";

// Controller.vue reads `roomClock` through @couchcade/game-sdk/clock via useClockSynced. Mocked so
// tests control sync state directly instead of waiting on real ping/pong samples. `vi.mock` is
// hoisted above every import in this file, so this runs before Controller.vue's own import does.
const { mockClock } = vi.hoisted(() => ({ mockClock: { synced: true } }));
vi.mock("@couchcade/game-sdk/clock", () => ({ roomClock: mockClock }));

const player: Player = createPlayers(1)[0] as Player;

function mountController(screen: QuickDrawScreen, data: QuickDrawRoundView | QuickDrawResultView) {
  const send = vi.fn<(input: QuickDrawInput, eventTimeStamp?: number) => number>(() => 1_000);
  const wrapper = mount(Controller, { props: { screen, data, player, send } });
  return { wrapper, send };
}

/**
 * Dispatches a real `PointerEvent` (jsdom sets its `timeStamp`; the constructor can't), and
 * returns it so a test can compare `send`'s stamped time against the exact event it came from.
 */
function tap(wrapper: ReturnType<typeof mountController>["wrapper"]): PointerEvent {
  const event = new PointerEvent("pointerdown", { bubbles: true, cancelable: true });
  wrapper.find(".hit-area").element.dispatchEvent(event);
  return event;
}

const watching: QuickDrawRoundView = { round: 1, target: 3, points: 0 };
const standoffRound2: QuickDrawRoundView = { round: 2, target: 3, points: 1 };

describe("Controller.vue", () => {
  afterEach(() => {
    mockClock.synced = true;
  });

  it("renders qd-watch: the round status, 'Watch the TV' and the watch hint", () => {
    const { wrapper } = mountController("qd-watch", watching);
    expect(wrapper.find(".status").text()).toBe("Round 1 · first to 3");
    expect(wrapper.find(".cc-big-action").text()).toBe("Watch the TV");
    expect(wrapper.find(".hint").text()).toBe("Tap when the TV shouts DRAW");
    expect(wrapper.find(".cc-big-action").classes()).toContain("cc-big-action--waiting");
  });

  it("does nothing when tapped during qd-watch", () => {
    const { wrapper, send } = mountController("qd-watch", watching);
    tap(wrapper);
    expect(send).not.toHaveBeenCalled();
  });

  it("renders qd-standoff as the red 'Wait for DRAW' action, hit anywhere below the status", () => {
    const { wrapper } = mountController("qd-standoff", standoffRound2);
    expect(wrapper.find(".status").text()).toBe("Round 2 · first to 3");
    expect(wrapper.find(".cc-big-action").text()).toBe("Wait for DRAW");
    expect(wrapper.find(".cc-big-action").classes()).toContain("cc-big-action--dont-tap");
    expect(wrapper.find(".hint").text()).toBe("Tap anywhere at DRAW");
  });

  it("sends a schema-valid draw input on pointerdown anywhere in the hit area, stamped with the event's timeStamp", () => {
    const { wrapper, send } = mountController("qd-standoff", standoffRound2);
    const event = tap(wrapper);

    expect(send).toHaveBeenCalledTimes(1);
    const [input, timeStamp] = send.mock.calls[0] as [unknown, number];
    expect(inputSchema.safeParse(input).success).toBe(true);
    expect(input).toEqual({ type: "draw", payload: { round: 2 } });
    expect(timeStamp).toBe(event.timeStamp);
  });

  it("disables itself locally the instant it's tapped, and ignores a second tap", async () => {
    const { wrapper, send } = mountController("qd-standoff", standoffRound2);
    tap(wrapper);
    await wrapper.vm.$nextTick();

    expect(wrapper.find(".status").text()).toBe("Tapped!");
    expect(wrapper.find(".cc-big-action").text()).toBe("—");
    expect(wrapper.find(".cc-big-action").classes()).toContain("cc-big-action--disabled");
    expect(wrapper.find(".hint").text()).toBe("Watch the TV");

    tap(wrapper);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("resets the local tapped state on the next round's standoff", async () => {
    const { wrapper, send } = mountController("qd-standoff", { round: 3, target: 3, points: 1 });
    tap(wrapper);
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".cc-big-action").classes()).toContain("cc-big-action--disabled");

    await wrapper.setProps({ screen: "qd-standoff", data: { round: 4, target: 3, points: 1 } });
    expect(wrapper.find(".cc-big-action").classes()).toContain("cc-big-action--dont-tap");

    tap(wrapper);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1]?.[0]).toEqual({ type: "draw", payload: { round: 4 } });
  });

  it("shows qd-watch instead of qd-standoff, and ignores taps, before the room clock has synced", () => {
    mockClock.synced = false;
    const { wrapper, send } = mountController("qd-standoff", standoffRound2);

    expect(wrapper.find(".cc-big-action").text()).toBe("Watch the TV");
    expect(wrapper.find(".cc-big-action").classes()).toContain("cc-big-action--waiting");
    tap(wrapper);
    expect(send).not.toHaveBeenCalled();
  });

  it.each([
    [
      "won",
      { round: 2, target: 3, points: 2, result: "won", ms: 243, winner: "Player 1" } as const,
      "You won the round!",
      "0.243 s · 2 points",
    ],
    [
      "lost",
      { round: 2, target: 3, points: 0, result: "lost", ms: 301, winner: "Noor" } as const,
      "Noor was faster",
      "Your time 0.301 s",
    ],
    [
      "foul",
      { round: 2, target: 3, points: 0, result: "foul", ms: null, winner: "Player 1" } as const,
      "Too early, that's a foul",
      "Wait for DRAW next time",
    ],
    [
      "fooled",
      { round: 3, target: 3, points: 0, result: "fooled", ms: null, winner: "Player 1" } as const,
      "That was a fake, that's a foul",
      "Only DRAW counts",
    ],
    [
      "slow",
      { round: 4, target: 3, points: 0, result: "slow", ms: null, winner: null } as const,
      "Too slow this time",
      "Tap as soon as you see DRAW",
    ],
  ])("renders qd-result, %s", (_result, data, statusLine, hint) => {
    const { wrapper, send } = mountController("qd-result", data);
    expect(wrapper.find(".status").text()).toBe(statusLine);
    expect(wrapper.find(".hint").text()).toBe(hint);
    expect(wrapper.find(".cc-big-action").text()).toBe("Watch the TV");
    // Every result screen is inert: it never sends a second input.
    tap(wrapper);
    expect(send).not.toHaveBeenCalled();
    expect(wrapper.find(".status").text().length).toBeLessThan(40);
    expect(wrapper.find(".hint").text().length).toBeLessThan(40);
  });
});
