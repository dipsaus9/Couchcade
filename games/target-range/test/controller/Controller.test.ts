import { createPlayers } from "@couchcade/game-sdk/testing";
import type { Player } from "@couchcade/game-sdk/contract";
import { createFakeAdapter } from "@couchcade/motion/sensors";
import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TargetRangeMotion } from "../../src/controller/aim.ts";
import Controller from "../../src/controller/Controller.vue";
import { inputSchema } from "../../src/shared/input.ts";
import type { TargetRangeInput } from "../../src/shared/input.ts";
import type { TargetRangeScreen, TargetRangeView } from "../../src/shared/view.ts";
import { createTestChannel } from "./channel.ts";
import { flatCalibration, turn } from "./motion.ts";

// Controller.vue polls `roomClock.synced` through @couchcade/game-sdk/clock. Mocked so tests set
// the sync state directly. `vi.mock` is hoisted above the imports.
const { mockClock } = vi.hoisted(() => ({ mockClock: { synced: true } }));
vi.mock("@couchcade/game-sdk/clock", () => ({ roomClock: mockClock }));

const player = createPlayers(1)[0] as Player;
const calibration = flatCalibration();

const view = (patch: Partial<TargetRangeView> = {}): TargetRangeView => ({
  round: 1,
  arrow: 1,
  volley: 1,
  points: 0,
  last: null,
  ...patch,
});

function mountController(
  screen: TargetRangeScreen,
  data: TargetRangeView,
  motion?: TargetRangeMotion,
) {
  // Aim, `shoot` and `lower` all go through the one `InputChannel` now (CC-11.9); `send` stays a
  // required prop (the game contract's turn-based, one-off path) but Target Range doesn't use it.
  const send = vi.fn<(input: TargetRangeInput, t?: number) => number>(() => 1);
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

/** Touch, pull down `pull` px, let go. Returns the pointerup event. */
async function pullAndRelease(wrapper: Wrapper, pull: number, end = "pointerup") {
  pointer(button(wrapper), "pointerdown", { clientY: 400 });
  await wrapper.vm.$nextTick();
  pointer(button(wrapper), "pointermove", { clientY: 400 + pull });
  await wrapper.vm.$nextTick();
  const release = pointer(button(wrapper), end, { clientY: 400 + pull });
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

  describe("screens", () => {
    it("tr-watch in round 1's intro", () => {
      const { wrapper, send } = mountController("tr-watch", view(), {
        mode: "motion",
        adapter: createFakeAdapter(),
        calibration,
      });
      expect(text(wrapper)).toEqual({
        status: "Round 1 of 4 · near",
        action: "Watch the TV",
        hint: "Hold on tight, point at the TV",
      });
      expect(wrapper.find(".cc-big-action").classes()).toContain("cc-big-action--waiting");
      expect(wrapper.find(".pad").exists()).toBe(false);
      pointer(button(wrapper), "pointerdown");
      expect(send).not.toHaveBeenCalled();
      expectShortText(wrapper);
    });

    it("tr-watch in a later round's intro", () => {
      const { wrapper } = mountController(
        "tr-watch",
        view({ round: 2, volley: 4, last: 6, points: 20 }),
      );
      expect(text(wrapper)).toEqual({
        status: "Round 2 of 4 · middle",
        action: "Watch the TV",
        hint: "Aim a little high",
      });
    });

    it("tr-shoot: pull down to draw", () => {
      const { wrapper, send } = mountController(
        "tr-shoot",
        view({ arrow: 2, volley: 2, last: 9 }),
        {
          mode: "motion",
          adapter: createFakeAdapter(),
          calibration,
        },
      );
      expect(text(wrapper)).toEqual({
        status: "Arrow 2 of 3",
        action: "Pull down to draw",
        hint: "Last arrow: 9",
      });
      expect(wrapper.find(".cc-big-action").classes()).toContain("cc-big-action--hold");
      expect(wrapper.find(".pad").exists()).toBe(false);
      expect(send).not.toHaveBeenCalled();
      expectShortText(wrapper);
    });

    it("drawing fills the circle with power, then says Full draw!", async () => {
      const { wrapper } = mountController("tr-shoot", view(), {
        mode: "motion",
        adapter: createFakeAdapter(),
        calibration,
      });
      pointer(button(wrapper), "pointerdown", { clientY: 300 });
      await wrapper.vm.$nextTick();
      pointer(button(wrapper), "pointermove", { clientY: 375 });
      await wrapper.vm.$nextTick();
      expect(text(wrapper)).toEqual({
        status: "Let go to shoot",
        action: "Draw…",
        hint: "Hold steady",
      });
      expect(wrapper.find<HTMLElement>(".fill").element.style.blockSize).toBe("50%");

      pointer(button(wrapper), "pointermove", { clientY: 600 });
      await wrapper.vm.$nextTick();
      expect(text(wrapper).action).toBe("Full draw!");
      expect(wrapper.find<HTMLElement>(".fill").element.style.blockSize).toBe("100%");
      expectShortText(wrapper);
    });

    it("tr-watch after a volley shows the result", async () => {
      const { wrapper } = mountController("tr-shoot", view({ arrow: 2, volley: 2 }));
      await wrapper.setProps({
        screen: "tr-watch",
        data: view({ arrow: 2, volley: 2, last: 10, points: 18 }),
      });
      expect(text(wrapper)).toEqual({
        status: "Bullseye!",
        action: "Watch the TV",
        hint: "18 points so far",
      });
      await wrapper.setProps({ data: view({ arrow: 2, volley: 2, last: "late", points: 8 }) });
      expect(text(wrapper).status).toBe("Too late for that one");
    });

    it("keeps the draw button off until the room clock has synced", async () => {
      mockClock.synced = false;
      const { wrapper, send } = mountController("tr-shoot", view(), {
        mode: "motion",
        adapter: createFakeAdapter(),
        calibration,
      });
      expect(wrapper.find(".cc-big-action").classes()).toContain("cc-big-action--disabled");
      pointer(button(wrapper), "pointerdown");
      expect(send).not.toHaveBeenCalled();

      mockClock.synced = true;
      vi.advanceTimersByTime(250);
      await wrapper.vm.$nextTick();
      expect(wrapper.find(".cc-big-action").classes()).toContain("cc-big-action--hold");
    });
  });

  describe("motion", () => {
    const motion = (): TargetRangeMotion => ({
      mode: "motion",
      adapter: createFakeAdapter(),
      calibration,
    });

    it("shoots with the aim at release and the draw power, stamped with the release time", async () => {
      const adapter = createFakeAdapter();
      const m: TargetRangeMotion = { mode: "motion", adapter, calibration };
      const { wrapper, sent, inputs, timestamps } = mountController(
        "tr-shoot",
        view({ round: 2, arrow: 2, volley: 5 }),
        m,
      );

      const down = pointer(button(wrapper), "pointerdown", { clientY: 400 });
      await wrapper.vm.$nextTick();
      expect(inputs()).toEqual([{ type: "aim", payload: { yaw: 0, pitch: 0 } }]);

      // Samples share the event time base, as they do on a phone.
      for (const sample of turn(down.timeStamp + 16, 600, 20)) {
        vi.advanceTimersByTime(16);
        adapter.push(sample);
      }
      pointer(button(wrapper), "pointermove", { clientY: 520 });
      const release = pointer(button(wrapper), "pointerup", { clientY: 520 });
      await wrapper.vm.$nextTick();
      vi.advanceTimersByTime(300);

      const shot = sent.find((input) => input.type === "shoot");
      expect(shot).toMatchObject({ type: "shoot", payload: { volley: 5, power: 0.8 } });
      expect(shot && timestamps.get(shot)).toBe(release.timeStamp);
      const payload = shot?.payload as { aim: { yaw: number } };
      expect(Math.abs(payload.aim.yaw)).toBeGreaterThan(0.1);
      for (const input of inputs()) expect(inputSchema.safeParse(input).success).toBe(true);

      expect(text(wrapper)).toEqual({ status: "Arrow away!", action: "—", hint: "Watch the TV" });
      expect(wrapper.find(".cc-big-action").classes()).toContain("cc-big-action--disabled");
    });

    it("lets go too early: lowers the bow and says to pull further", async () => {
      const { wrapper, inputs } = mountController("tr-shoot", view({ volley: 1 }), motion());
      await pullAndRelease(wrapper, 30);
      vi.advanceTimersByTime(300);
      expect(inputs().at(-1)).toEqual({ type: "lower", payload: { volley: 1 } });
      expect(text(wrapper)).toEqual({
        status: "Pull further to shoot",
        action: "Pull down to draw",
        hint: "Point at the TV",
      });
      for (const input of inputs()) expect(inputSchema.safeParse(input).success).toBe(true);

      // It can draw again.
      await pullAndRelease(wrapper, 150);
      vi.advanceTimersByTime(300);
      expect(inputs().at(-1)).toMatchObject({ type: "shoot", payload: { power: 1 } });
    });

    it("a cancelled pointer lowers the bow even at full draw", async () => {
      const { wrapper, inputs } = mountController("tr-shoot", view(), motion());
      await pullAndRelease(wrapper, 200, "pointercancel");
      vi.advanceTimersByTime(300);
      expect(inputs().at(-1)).toEqual({ type: "lower", payload: { volley: 1 } });
    });

    it("never shoots twice in a volley, and draws again in the next one", async () => {
      const { wrapper, inputs } = mountController("tr-shoot", view(), motion());
      await pullAndRelease(wrapper, 150);
      await pullAndRelease(wrapper, 150);
      vi.advanceTimersByTime(1000);
      expect(inputs().filter((input) => input.type === "shoot")).toHaveLength(1);

      await wrapper.setProps({ screen: "tr-watch", data: view({ last: 6, points: 6 }) });
      await wrapper.setProps({
        screen: "tr-shoot",
        data: view({ arrow: 2, volley: 2, last: 6, points: 6 }),
      });
      expect(text(wrapper).action).toBe("Pull down to draw");
      await pullAndRelease(wrapper, 150);
      vi.advanceTimersByTime(1000);
      expect(inputs().filter((input) => input.type === "shoot")).toHaveLength(2);
      expect(inputs().at(-1)).toMatchObject({ payload: { volley: 2 } });
    });

    it("only the first finger draws", async () => {
      const { wrapper, inputs } = mountController("tr-shoot", view(), motion());
      pointer(button(wrapper), "pointerdown", { clientY: 400, pointerId: 1 });
      pointer(button(wrapper), "pointerdown", { clientY: 100, pointerId: 2 });
      pointer(button(wrapper), "pointerup", { clientY: 100, pointerId: 2 });
      await wrapper.vm.$nextTick();
      expect(text(wrapper).status).toBe("Let go to shoot");
      pointer(button(wrapper), "pointerup", { clientY: 560, pointerId: 1 });
      vi.advanceTimersByTime(1000);
      expect(inputs().filter((input) => input.type !== "aim")).toEqual([
        { type: "shoot", payload: { volley: 1, aim: { yaw: 0, pitch: 0 }, power: 1 } },
      ]);
    });

    it("drops a draw still held when the volley closes", async () => {
      const { wrapper, inputs } = mountController("tr-shoot", view(), motion());
      pointer(button(wrapper), "pointerdown", { clientY: 400 });
      await wrapper.setProps({ screen: "tr-watch", data: view({ last: "none" }) });
      pointer(button(wrapper), "pointerup", { clientY: 600 });
      vi.advanceTimersByTime(1000);
      expect(inputs().map((input) => input.type)).toEqual(["aim"]);
      expect(text(wrapper).status).toBe("No arrow this time");
    });
  });

  describe("touch fallback", () => {
    it.each([
      ["no motion result", undefined],
      ["motion denied or unsupported", { mode: "touch" } as const],
    ])("shows the aim pad and Centre with %s", (_case, motion) => {
      const { wrapper, inputs } = mountController(
        "tr-shoot",
        view({ arrow: 2, volley: 2, last: 9 }),
        motion,
      );
      expect(wrapper.find(".pad").exists()).toBe(true);
      expect(wrapper.find(".aim-pad button").text()).toBe("Centre");
      expect(text(wrapper)).toEqual({
        status: "Arrow 2 of 3",
        action: "Pull down to draw",
        hint: "Drag the pad to aim",
      });
      // The volley opened: the crosshair shows at the current aim.
      expect(inputs()).toEqual([{ type: "aim", payload: { yaw: 0, pitch: 0 } }]);
      expectShortText(wrapper);
    });

    it("aims with the pad and shoots with its aim", async () => {
      const { wrapper, inputs } = mountController("tr-shoot", view(), { mode: "touch" });
      const pad = wrapper.find(".pad").element;
      vi.advanceTimersByTime(300);
      pointer(pad, "pointerdown", { clientX: 100, clientY: 100, pointerId: 7 });
      vi.advanceTimersByTime(100);
      pointer(pad, "pointermove", { clientX: 150, clientY: 100, pointerId: 7 });
      vi.advanceTimersByTime(100);
      pointer(pad, "pointerup", { clientX: 150, clientY: 100, pointerId: 7 });
      vi.advanceTimersByTime(300);

      await pullAndRelease(wrapper, 150);
      vi.advanceTimersByTime(1000);
      expect(inputs().at(-1)).toEqual({
        type: "shoot",
        payload: { volley: 1, aim: { yaw: 0.375, pitch: 0 }, power: 1 },
      });
      for (const input of inputs()) expect(inputSchema.safeParse(input).success).toBe(true);
      expect(wrapper.find(".pad").exists()).toBe(false);
    });

    it("the Centre button sets the aim back to the middle", async () => {
      const { wrapper, inputs } = mountController("tr-shoot", view(), { mode: "touch" });
      const pad = wrapper.find(".pad").element;
      pointer(pad, "pointerdown", { clientX: 100, clientY: 100 });
      pointer(pad, "pointermove", { clientX: 100, clientY: 70 });
      pointer(pad, "pointerup", { clientX: 100, clientY: 70 });
      pointer(wrapper.find(".aim-pad button").element, "pointerdown");
      await pullAndRelease(wrapper, 150);
      vi.advanceTimersByTime(1000);
      expect(inputs().at(-1)).toMatchObject({ payload: { aim: { yaw: 0, pitch: 0 } } });
    });

    it("switches to the pad when motion stops mid-game", async () => {
      const adapter = createFakeAdapter();
      const { wrapper } = mountController("tr-shoot", view(), {
        mode: "motion",
        adapter,
        calibration,
      });
      expect(wrapper.find(".pad").exists()).toBe(false);
      await wrapper.setProps({ motion: { mode: "touch" } });
      expect(wrapper.find(".pad").exists()).toBe(true);
      expect(text(wrapper).hint).toBe("Drag the pad to aim");
    });
  });

  it("stops the input channel and the sensors when unmounted", async () => {
    const adapter = createFakeAdapter();
    const { wrapper, sent } = mountController("tr-shoot", view(), {
      mode: "motion",
      adapter,
      calibration,
    });
    pointer(button(wrapper), "pointerdown", { clientY: 400 });
    wrapper.unmount();
    for (const sample of turn(performance.now(), 500, 40)) adapter.push(sample);
    vi.advanceTimersByTime(1000);
    expect(sent).toHaveLength(1);
  });
});
