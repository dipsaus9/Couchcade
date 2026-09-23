import { createPlayers } from "@couchcade/game-sdk/testing";
import type { Player } from "@couchcade/game-sdk/contract";
import { createFakeAdapter } from "@couchcade/motion/sensors";
import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BandejaMotion } from "../../src/controller/swing.ts";
import Controller from "../../src/controller/Controller.vue";
import { inputSchema, type BandejaInput } from "../../src/shared/input.ts";
import type { BandejaScreen, BandejaView } from "../../src/shared/view.ts";
import { createTestChannel } from "./channel.ts";
import { flatCalibration, swingBurst } from "./motion.ts";

// Controller.vue polls `roomClock.synced` through @couchcade/game-sdk/clock. Mocked so tests set
// the sync state directly. `vi.mock` is hoisted above the imports. `toHostTime` is mocked too: the
// swing gestures package calls it internally every time a swing emits.
const { mockClock } = vi.hoisted(() => ({ mockClock: { synced: true } }));
vi.mock("@couchcade/game-sdk/clock", () => ({
  roomClock: mockClock,
  toHostTime: (t: number) => t,
}));

const player = createPlayers(1)[0] as Player;
const calibration = flatCalibration();

const view = (patch: Partial<BandejaView> = {}): BandejaView => ({
  side: "a",
  slot: "left",
  scores: [3, 2],
  target: 7,
  point: 6,
  partner: "Ren",
  opponents: ["Noor", "Sam"],
  serving: false,
  last: null,
  ...patch,
});

function mountController(screen: BandejaScreen, data: BandejaView, motion?: BandejaMotion) {
  const send = vi.fn<(input: BandejaInput, t?: number) => void>();
  const { channel, sent, timestamps } = createTestChannel();
  const wrapper = mount(Controller, {
    props: { screen, data, player, send, input: channel, ...(motion ? { motion } : {}) },
  });
  const button = wrapper.find(".cc-big-action").element as HTMLElement;
  vi.spyOn(button, "getBoundingClientRect").mockReturnValue({
    left: 0,
    right: 200,
    top: 0,
    bottom: 200,
    width: 200,
    height: 200,
    x: 0,
    y: 0,
    toJSON: () => ({}),
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
    it("bj-play, motion, first point: disabled, the room-to-swing hint", () => {
      const { wrapper, send } = mountController("bj-play", view({ point: 1, last: null }), {
        mode: "motion",
        adapter: createFakeAdapter(),
        calibration,
      });
      expect(text(wrapper)).toEqual({
        status: "Bandeja · first to 7",
        action: "Swing your arm",
        hint: "Room to swing? Go for it",
      });
      expect(wrapper.find(".cc-big-action").classes()).toContain("cc-big-action--disabled");
      pointer(button(wrapper), "pointerdown");
      expect(send).not.toHaveBeenCalled();
      expectShortText(wrapper);
    });

    it("bj-play, motion, serving: the score and your-serve line", async () => {
      const { wrapper } = mountController(
        "bj-play",
        view({ point: 4, last: { won: true, reason: "net" }, serving: true, scores: [3, 2] }),
        { mode: "motion", adapter: createFakeAdapter(), calibration },
      );
      vi.advanceTimersByTime(3000);
      await wrapper.vm.$nextTick();
      expect(text(wrapper).status).toBe("3 – 2 · your serve");
      expect(text(wrapper).hint).toBe("Watch the ring on the TV");
    });

    it("bj-play, touch: the pad and its own constant hint", () => {
      const { wrapper } = mountController("bj-play", view({ point: 1, last: null }), {
        mode: "touch",
      });
      expect(text(wrapper)).toEqual({
        status: "Bandeja · first to 7",
        action: "Tap left or right",
        hint: "Tap as the ring closes",
      });
      expect(wrapper.find(".cc-big-action").classes()).toContain("cc-big-action--hold");
      expectShortText(wrapper);
    });

    it("bj-play shows the point's outcome right away, then settles to the steady score line", async () => {
      const { wrapper } = mountController(
        "bj-play",
        view({ point: 4, scores: [4, 2], last: { won: true, reason: "net" }, serving: true }),
      );
      expect(text(wrapper).status).toBe("Point! 4 – 2");
      vi.advanceTimersByTime(2600);
      await wrapper.vm.$nextTick();
      expect(text(wrapper).status).toBe("4 – 2 · your serve");
    });

    it("keeps the controls off until the room clock has synced", () => {
      mockClock.synced = false;
      const { wrapper, send } = mountController("bj-play", view());
      expect(wrapper.find(".cc-big-action").classes()).toContain("cc-big-action--disabled");
      expect(text(wrapper).action).toBe("Wait…");
      pointer(button(wrapper), "pointerdown");
      expect(send).not.toHaveBeenCalled();
    });

    it("bj-end: the final score and Watch the TV", () => {
      const { wrapper } = mountController("bj-end", view({ side: "a", scores: [7, 4] }));
      expect(text(wrapper)).toEqual({
        status: "You won 7 – 4",
        action: "Watch the TV",
        hint: "Nice rallies",
      });
      expectShortText(wrapper);
    });
  });

  describe("swinging with motion (AC 1, AC 2)", () => {
    it("sends a swing through the input channel with the current point, speed and angle", async () => {
      const adapter = createFakeAdapter();
      const motion: BandejaMotion = { mode: "motion", adapter, calibration };
      const { wrapper, inputs } = mountController("bj-play", view({ point: 6 }), motion);

      for (const sample of swingBurst(0, 300, 900)) {
        vi.advanceTimersByTime(16);
        adapter.push(sample);
      }
      await wrapper.vm.$nextTick();

      const swing = inputs().find((input) => input.type === "swing");
      expect(swing).toMatchObject({ type: "swing", payload: { point: 6 } });
      const payload = (swing as Extract<BandejaInput, { type: "swing" }>).payload;
      expect(payload.speed).toBeGreaterThan(0);
      for (const input of inputs()) expect(inputSchema.safeParse(input).success).toBe(true);
    });

    it("flashes the pad for 400 ms after a swing sends, then clears", async () => {
      const adapter = createFakeAdapter();
      const motion: BandejaMotion = { mode: "motion", adapter, calibration };
      const { wrapper } = mountController("bj-play", view({ point: 6 }), motion);

      for (const sample of swingBurst(0, 300, 900)) {
        vi.advanceTimersByTime(16);
        adapter.push(sample);
      }
      await wrapper.vm.$nextTick();
      expect(wrapper.find(".pad").classes()).toContain("pad--swung");

      vi.advanceTimersByTime(400);
      await wrapper.vm.$nextTick();
      expect(wrapper.find(".pad").classes()).not.toContain("pad--swung");
    });

    it("re-references the grip for a new point, and swings echo the new point", async () => {
      const adapter = createFakeAdapter();
      const motion: BandejaMotion = { mode: "motion", adapter, calibration };
      const { wrapper, inputs } = mountController("bj-play", view({ point: 1 }), motion);
      await wrapper.setProps({ screen: "bj-play", data: view({ point: 2 }) });

      for (const sample of swingBurst(0, 300, 900)) {
        vi.advanceTimersByTime(16);
        adapter.push(sample);
      }
      await wrapper.vm.$nextTick();

      const swing = inputs().find((input) => input.type === "swing");
      expect(swing).toMatchObject({ payload: { point: 2 } });
    });

    it("stops the sensors when unmounted", () => {
      const adapter = createFakeAdapter();
      const motion: BandejaMotion = { mode: "motion", adapter, calibration };
      const { wrapper, sent } = mountController("bj-play", view({ point: 1 }), motion);
      const before = sent.length;
      wrapper.unmount();
      for (const sample of swingBurst(0, 300, 900)) adapter.push(sample);
      expect(sent.length).toBe(before);
    });
  });

  describe("touch fallback (AC 3)", () => {
    it.each([
      ["no motion result", undefined],
      ["motion denied or unsupported", { mode: "touch" } as const],
    ])("shows the touch pad with %s", (_case, motion) => {
      const { wrapper } = mountController("bj-play", view(), motion);
      expect(text(wrapper).action).toBe("Tap left or right");
      expectShortText(wrapper);
    });

    it("taps the left half for a backhand swing and the right half for a forehand", async () => {
      const { wrapper, inputs } = mountController("bj-play", view({ point: 5 }), { mode: "touch" });

      pointer(button(wrapper), "pointerdown", { clientX: 40 });
      await wrapper.vm.$nextTick();
      vi.advanceTimersByTime(500);
      pointer(button(wrapper), "pointerdown", { clientX: 160 });
      await wrapper.vm.$nextTick();

      const swings = inputs().filter((input) => input.type === "swing");
      expect(swings).toHaveLength(2);
      expect(swings[0]).toMatchObject({
        type: "swing",
        payload: { point: 5, angle: -60, speed: 0.7 },
      });
      expect(swings[1]).toMatchObject({
        type: "swing",
        payload: { point: 5, angle: 60, speed: 0.7 },
      });
      for (const input of inputs()) expect(inputSchema.safeParse(input).success).toBe(true);
    });

    it("switches to touch when motion stops mid-match", async () => {
      const adapter = createFakeAdapter();
      const { wrapper } = mountController("bj-play", view(), {
        mode: "motion",
        adapter,
        calibration,
      });
      expect(text(wrapper).action).toBe("Swing your arm");
      await wrapper.setProps({ motion: { mode: "touch" } });
      expect(text(wrapper).action).toBe("Tap left or right");
    });
  });
});
