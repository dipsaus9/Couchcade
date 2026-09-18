import { createPlayers } from "@couchcade/game-sdk/testing";
import type { Player } from "@couchcade/game-sdk/contract";
import { createFakeAdapter } from "@couchcade/motion/sensors";
import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StrikeNightMotion } from "../../src/controller/bowl.ts";
import Controller from "../../src/controller/Controller.vue";
import { inputSchema, type StrikeNightInput } from "../../src/shared/input.ts";
import type { StrikeNightScreen, StrikeNightView } from "../../src/shared/view.ts";
import { createTestChannel } from "./channel.ts";
import { flatCalibration, turn } from "./motion.ts";

// Controller.vue polls `roomClock.synced` through @couchcade/game-sdk/clock. Mocked so tests set
// the sync state directly. `vi.mock` is hoisted above the imports. `toHostTime` is mocked too: the
// swing gestures package calls it internally (for the `peakAt` this controller never reads) every
// time a swing emits.
const { mockClock } = vi.hoisted(() => ({ mockClock: { synced: true } }));
vi.mock("@couchcade/game-sdk/clock", () => ({
  roomClock: mockClock,
  toHostTime: (t: number) => t,
}));

const player = createPlayers(1)[0] as Player;
const calibration = flatCalibration();

const view = (patch: Partial<StrikeNightView> = {}): StrikeNightView => ({
  frame: 2,
  frames: 10,
  turn: 5,
  roll: 1,
  x: 0,
  total: 34,
  bowler: "Noor",
  standing: 10,
  first: false,
  last: null,
  ...patch,
});

function mountController(
  screen: StrikeNightScreen,
  data: StrikeNightView,
  motion?: StrikeNightMotion,
) {
  const send = vi.fn<(input: StrikeNightInput, t?: number) => void>();
  const { channel, sent, timestamps } = createTestChannel();
  const wrapper = mount(Controller, {
    props: { screen, data, player, send, input: channel, ...(motion ? { motion } : {}) },
  });
  const inputs = () => [...sent];
  return { wrapper, send, sent, inputs, timestamps };
}

type Wrapper = ReturnType<typeof mountController>["wrapper"];

function pointer(
  target: Element,
  type: string,
  init: { clientX?: number; clientY?: number; pointerId?: number } = {},
): PointerEvent {
  // Vue drops an event on a parent listener attached in the same millisecond, so time moves on.
  vi.advanceTimersByTime(1);
  const event = new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, ...init });
  target.dispatchEvent(event);
  return event;
}

const button = (wrapper: Wrapper) => wrapper.find(".cc-big-action").element;
const bar = (wrapper: Wrapper) => wrapper.find('[role="slider"]').element;

/** Grips the big action, optionally moves, then releases (or cancels). */
async function gripAndRelease(
  wrapper: Wrapper,
  end: "pointerup" | "pointercancel" = "pointerup",
  move?: { clientX?: number; clientY?: number },
) {
  pointer(button(wrapper), "pointerdown", { clientY: 400 });
  await wrapper.vm.$nextTick();
  if (move) {
    pointer(button(wrapper), "pointermove", { clientY: 400, ...move });
    await wrapper.vm.$nextTick();
  }
  const release = pointer(button(wrapper), end, { clientY: 400, ...move });
  await wrapper.vm.$nextTick();
  return release;
}

const text = (wrapper: Wrapper) => ({
  status: wrapper.find(".status").text(),
  action: wrapper.find(".cc-big-action").text(),
  hint: wrapper.find(".hint").text(),
});

function expectShortText(wrapper: Wrapper): void {
  for (const line of Object.values(text(wrapper))) expect(line.length).toBeLessThan(40);
}

describe("Controller.vue", () => {
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "performance", "Date"],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    mockClock.synced = true;
  });

  describe("screens (AC 1)", () => {
    it("sn-watch shows the bowler and this player's frame and total", () => {
      const { wrapper, send } = mountController("sn-watch", view());
      expect(text(wrapper)).toEqual({
        status: "Noor is bowling",
        action: "Watch the TV",
        hint: "Frame 2 of 10 · you have 34",
      });
      expect(wrapper.find(".cc-big-action").classes()).toContain("cc-big-action--waiting");
      expect(wrapper.find('[role="slider"]').exists()).toBe(false);
      pointer(button(wrapper), "pointerdown");
      expect(send).not.toHaveBeenCalled();
      expectShortText(wrapper);
    });

    it("sn-next tells the next bowler to get ready", () => {
      const { wrapper } = mountController("sn-next", view());
      expect(text(wrapper)).toEqual({
        status: "You're up next",
        action: "Watch the TV",
        hint: "Get ready to bowl",
      });
    });

    it("sn-bowl roll 1 shows the move bar and the hold-the-ball action, with the your-turn cue", () => {
      const { wrapper } = mountController("sn-bowl", view({ roll: 1 }), {
        mode: "motion",
        adapter: createFakeAdapter(),
        calibration,
      });
      expect(text(wrapper)).toEqual({
        status: "Frame 2 of 10 · your turn",
        action: "Hold the ball",
        hint: "Drag the bar to move",
      });
      expect(wrapper.find(".cc-big-action").classes()).toContain("cc-big-action--hold");
      expect(wrapper.find('[role="slider"]').exists()).toBe(true);
      expectShortText(wrapper);
    });

    it("sn-bowl roll 2 shows the pins left", () => {
      const { wrapper } = mountController("sn-bowl", view({ roll: 2, standing: 4 }));
      expect(text(wrapper).status).toBe("4 pins left");
    });

    it("keeps the grip off until the room clock has synced", () => {
      mockClock.synced = false;
      const { wrapper, send } = mountController("sn-bowl", view());
      expect(wrapper.find(".cc-big-action").classes()).toContain("cc-big-action--disabled");
      pointer(button(wrapper), "pointerdown");
      expect(send).not.toHaveBeenCalled();
    });

    it("sn-result shows the outcome and, once the frame ends, the frame score and total", () => {
      const { wrapper } = mountController(
        "sn-result",
        view({ last: { pins: 10, mark: "strike", auto: false, frame: 30 } }),
      );
      expect(text(wrapper)).toEqual({
        status: "Strike!",
        action: "Watch the TV",
        hint: "Frame 30 · total 34",
      });
      expectShortText(wrapper);
    });
  });

  describe("gripping with motion", () => {
    const motion = (): StrikeNightMotion => ({
      mode: "motion",
      adapter: createFakeAdapter(),
      calibration,
    });

    it("shows gripping, then bowls with the swing's speed, angle and spin and the stand position", async () => {
      const adapter = createFakeAdapter();
      const m: StrikeNightMotion = { mode: "motion", adapter, calibration };
      const { wrapper, sent, inputs, timestamps } = mountController(
        "sn-bowl",
        view({ turn: 7, x: 0.2 }),
        m,
      );

      const down = pointer(button(wrapper), "pointerdown");
      await wrapper.vm.$nextTick();
      expect(text(wrapper).status).toBe("Swing your arm");
      expect(inputs()).toEqual([{ type: "grip", payload: { turn: 7, held: true } }]);

      // The peak ties at the first sample (every sample here has the same magnitude), so the
      // release must land within the detector's 300 ms release window of that first sample.
      for (const sample of turn(down.timeStamp + 16, 48, 600)) {
        vi.advanceTimersByTime(16);
        adapter.push(sample);
      }
      const release = pointer(button(wrapper), "pointerup");
      await wrapper.vm.$nextTick();

      const bowl = sent.find((input) => input.type === "bowl");
      expect(bowl).toMatchObject({ type: "bowl", payload: { turn: 7, x: 0.2 } });
      // `bowl`'s eventTimeStamp is the swing's peak, not the (later) release: "peakAt stays on
      // the phone" (docs/games/strike-night.md, "Fairness").
      const stamp = bowl && timestamps.get(bowl);
      expect(stamp).toBeGreaterThanOrEqual(down.timeStamp);
      expect(stamp).toBeLessThanOrEqual(release.timeStamp);
      for (const input of inputs()) expect(inputSchema.safeParse(input).success).toBe(true);

      expect(text(wrapper)).toEqual({ status: "Ball away!", action: "—", hint: "Watch the TV" });
      expect(wrapper.find(".cc-big-action").classes()).toContain("cc-big-action--disabled");
    });

    it("a release too gentle to swing shows no swing, and the player can grip again", async () => {
      const { wrapper, inputs } = mountController("sn-bowl", view({ turn: 1 }), motion());
      await gripAndRelease(wrapper);
      expect(text(wrapper).status).toBe("Swing before you let go");
      expect(inputs()).toEqual([
        { type: "grip", payload: { turn: 1, held: true } },
        { type: "grip", payload: { turn: 1, held: false } },
      ]);
      for (const input of inputs()) expect(inputSchema.safeParse(input).success).toBe(true);
    });

    it("a cancelled grip releases without bowling", async () => {
      const { wrapper, inputs } = mountController("sn-bowl", view({ turn: 1 }), motion());
      await gripAndRelease(wrapper, "pointercancel");
      expect(inputs()).toEqual([
        { type: "grip", payload: { turn: 1, held: true } },
        { type: "grip", payload: { turn: 1, held: false } },
      ]);
      expect(text(wrapper).status).toBe("Frame 2 of 10 · your turn");
    });

    it("only the first finger grips", async () => {
      const { wrapper, inputs } = mountController("sn-bowl", view({ turn: 1 }), motion());
      pointer(button(wrapper), "pointerdown", { clientY: 400, pointerId: 1 });
      pointer(button(wrapper), "pointerdown", { clientY: 100, pointerId: 2 });
      pointer(button(wrapper), "pointerup", { clientY: 100, pointerId: 2 });
      await wrapper.vm.$nextTick();
      expect(text(wrapper).status).toBe("Swing your arm");
      pointer(button(wrapper), "pointerup", { clientY: 560, pointerId: 1 });
      expect(inputs().filter((input) => input.type === "bowl")).toEqual([]);
    });

    it("the next sn-bowl of a new turn resets the local grip state", async () => {
      const { wrapper, inputs } = mountController("sn-bowl", view({ turn: 1 }), motion());
      await gripAndRelease(wrapper);
      expect(text(wrapper).status).toBe("Swing before you let go");
      await wrapper.setProps({ screen: "sn-watch", data: view({ turn: 1 }) });
      await wrapper.setProps({ screen: "sn-bowl", data: view({ turn: 2 }) });
      expect(text(wrapper).status).toBe("Frame 2 of 10 · your turn");
      const before = inputs().length;
      pointer(button(wrapper), "pointerdown");
      await wrapper.vm.$nextTick();
      expect(inputs().slice(before)).toEqual([{ type: "grip", payload: { turn: 2, held: true } }]);
    });
  });

  describe("touch fallback (AC 3)", () => {
    it.each([
      ["no motion result", undefined],
      ["motion denied or unsupported", { mode: "touch" } as const],
    ])("shows the touch labels with %s", (_case, motion) => {
      const { wrapper } = mountController("sn-bowl", view(), motion);
      expect(text(wrapper).action).toBe("Swipe up to bowl");
      expectShortText(wrapper);
    });

    it("swipes up to bowl", async () => {
      const { wrapper, inputs } = mountController("sn-bowl", view({ turn: 3, x: -0.1 }), {
        mode: "touch",
      });
      pointer(button(wrapper), "pointerdown", { clientY: 400 });
      await wrapper.vm.$nextTick();
      expect(text(wrapper).action).toBe("Swipe up");
      vi.advanceTimersByTime(40);
      pointer(button(wrapper), "pointermove", { clientY: 250 });
      await wrapper.vm.$nextTick();
      vi.advanceTimersByTime(40);
      pointer(button(wrapper), "pointerup", { clientY: 200 });
      await wrapper.vm.$nextTick();

      const bowl = inputs().find((input) => input.type === "bowl");
      expect(bowl).toMatchObject({ type: "bowl", payload: { turn: 3, x: -0.1 } });
      for (const input of inputs()) expect(inputSchema.safeParse(input).success).toBe(true);
      expect(text(wrapper).status).toBe("Ball away!");
    });

    it("a swipe too short shows swipe further up", async () => {
      const { wrapper, inputs } = mountController("sn-bowl", view({ turn: 1 }), { mode: "touch" });
      pointer(button(wrapper), "pointerdown", { clientY: 400 });
      await wrapper.vm.$nextTick();
      pointer(button(wrapper), "pointerup", { clientY: 390 });
      await wrapper.vm.$nextTick();
      expect(text(wrapper).status).toBe("Swipe further up");
      expect(inputs().filter((input) => input.type === "bowl")).toEqual([]);
    });

    it("switches to touch when motion stops mid-game", async () => {
      const adapter = createFakeAdapter();
      const { wrapper } = mountController("sn-bowl", view(), {
        mode: "motion",
        adapter,
        calibration,
      });
      expect(text(wrapper).action).toBe("Hold the ball");
      await wrapper.setProps({ motion: { mode: "touch" } });
      expect(text(wrapper).action).toBe("Swipe up to bowl");
    });
  });

  describe("the move bar", () => {
    it("starts at the player's last position and streams move when dragged", async () => {
      const { wrapper, inputs } = mountController("sn-bowl", view({ turn: 9, x: 0.3 }));
      const slider = bar(wrapper);
      expect(slider.getAttribute("aria-valuenow")).toBe("0.65");

      // jsdom never lays out elements, so CcDragSlider's own pointer math (which reads the
      // track's rect) needs one: 200 px wide, left edge at 0.
      vi.spyOn(slider, "getBoundingClientRect").mockReturnValue({
        left: 0,
        right: 200,
        top: 0,
        bottom: 56,
        width: 200,
        height: 56,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      });
      pointer(slider, "pointerdown", { clientX: 200, clientY: 28 }); // the right edge: x = 1
      await wrapper.vm.$nextTick();
      const moves = inputs().filter((input) => input.type === "move");
      expect(moves).toEqual([{ type: "move", payload: { turn: 9, x: 1 } }]);
      for (const input of moves) expect(inputSchema.safeParse(input).success).toBe(true);
    });

    it("is disabled while gripping", async () => {
      const { wrapper } = mountController("sn-bowl", view({ turn: 1 }), {
        mode: "motion",
        adapter: createFakeAdapter(),
        calibration,
      });
      pointer(button(wrapper), "pointerdown");
      await wrapper.vm.$nextTick();
      expect(bar(wrapper).getAttribute("aria-disabled")).toBe("true");
    });
  });

  it("stops the input channel and the sensors when unmounted", async () => {
    const adapter = createFakeAdapter();
    const { wrapper, sent } = mountController("sn-bowl", view(), {
      mode: "motion",
      adapter,
      calibration,
    });
    pointer(button(wrapper), "pointerdown");
    const before = sent.length;
    wrapper.unmount();
    for (const sample of turn(performance.now(), 500, 900)) adapter.push(sample);
    expect(sent.length).toBe(before);
  });
});
