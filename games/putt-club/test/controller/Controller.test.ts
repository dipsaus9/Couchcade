import { createPlayers } from "@couchcade/game-sdk/testing";
import type { Player } from "@couchcade/game-sdk/contract";
import { createFakeAdapter } from "@couchcade/motion/sensors";
import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PuttClubMotion } from "../../src/controller/putt.ts";
import Controller from "../../src/controller/Controller.vue";
import { inputSchema } from "../../src/shared/input.ts";
import type { PuttClubInput } from "../../src/shared/input.ts";
import type { PuttClubScreen, PuttClubView } from "../../src/shared/view.ts";
import { createTestChannel } from "./channel.ts";
import { flatCalibration, puttBurst, turn } from "./motion.ts";

// Controller.vue polls `roomClock.synced` through @couchcade/game-sdk/clock. Mocked so tests set
// the sync state directly. `vi.mock` is hoisted above the imports. `toHostTime` is mocked too: the
// swing detector's own default `toRoomTime` calls it to stamp a swing's `peakAt`.
const { mockClock } = vi.hoisted(() => ({ mockClock: { synced: true } }));
vi.mock("@couchcade/game-sdk/clock", () => ({
  roomClock: mockClock,
  toHostTime: (t: number) => t,
}));

const player = createPlayers(1)[0] as Player;
const calibration = flatCalibration();

const view = (patch: Partial<PuttClubView> = {}): PuttClubView => ({
  hole: 4,
  holes: 9,
  par: 2,
  name: "The Elbow",
  turn: 1,
  stroke: 1,
  cap: 6,
  total: 0,
  toPar: 0,
  putter: player.name,
  first: true,
  last: null,
  ...patch,
});

function mountController(screen: PuttClubScreen, data: PuttClubView, motion?: PuttClubMotion) {
  // Aim, `line` and `putt` all go through the one `InputChannel` now (CC-11.9); `send` stays a
  // required prop (the game contract's turn-based, one-off path) but Putt Club doesn't use it.
  const send = vi.fn<(input: PuttClubInput, t?: number) => number>(() => 1);
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
    it("pc-watch: who's putting, and this player's status", () => {
      const { wrapper, send } = mountController("pc-watch", view({ putter: "Noor", toPar: 2 }));
      expect(text(wrapper)).toEqual({
        status: "Noor is putting",
        action: "Watch the TV",
        hint: "Hole 4 of 9 · you're +2",
      });
      expect(wrapper.find(".cc-big-action").classes()).toContain("cc-big-action--waiting");
      expect(wrapper.find(".pad").exists()).toBe(false);
      pointer(button(wrapper), "pointerdown");
      expect(send).not.toHaveBeenCalled();
      expectShortText(wrapper);
    });

    it("pc-next: get ready", () => {
      const { wrapper } = mountController("pc-next", view());
      expect(text(wrapper)).toEqual({
        status: "You're up next",
        action: "Watch the TV",
        hint: "Line it up on the TV",
      });
    });

    it("pc-putt: hold to lock the line", () => {
      const { wrapper, sent } = mountController("pc-putt", view({ hole: 1, par: 2, first: true }), {
        mode: "motion",
        adapter: createFakeAdapter(),
        calibration,
      });
      expect(text(wrapper)).toEqual({
        status: "Hole 1 · par 2 · your turn",
        action: "Hold to lock the line",
        hint: "Room to swing? Go for it",
      });
      expect(wrapper.find(".cc-big-action").classes()).toContain("cc-big-action--hold");
      expect(wrapper.find(".pad").exists()).toBe(false);
      // The turn opened: the line starts on the flag.
      expect(sent).toEqual([{ type: "aim", payload: { yaw: 0, pitch: 0 } }]);
      expectShortText(wrapper);
    });

    it("keeps the big action off until the room clock has synced", async () => {
      mockClock.synced = false;
      const { wrapper, send } = mountController("pc-putt", view(), {
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
    const motion = (): PuttClubMotion => ({
      mode: "motion",
      adapter: createFakeAdapter(),
      calibration,
    });

    it("aims, locks with the shown line, then putts with speed and angle from the swing", async () => {
      const adapter = createFakeAdapter();
      const m: PuttClubMotion = { mode: "motion", adapter, calibration };
      const { wrapper, sent, inputs } = mountController("pc-putt", view({ turn: 5 }), m);

      for (const sample of turn(performance.now(), 300, 8)) {
        vi.advanceTimersByTime(16);
        adapter.push(sample);
      }
      const liveAim = sent.filter((input) => input.type === "aim").length;
      expect(liveAim).toBeGreaterThan(1);

      pointer(button(wrapper), "pointerdown");
      await wrapper.vm.$nextTick();
      expect(text(wrapper).status).toBe("Line locked");
      const lockedLine = inputs().find((input) => input.type === "line");
      expect(lockedLine).toMatchObject({ type: "line", payload: { turn: 5, locked: true } });

      for (const sample of puttBurst(performance.now(), 300, 600)) {
        vi.advanceTimersByTime(16);
        adapter.push(sample);
      }
      await wrapper.vm.$nextTick();

      const putt = inputs().find((input) => input.type === "putt");
      expect(putt).toMatchObject({ type: "putt", payload: { turn: 5 } });
      const payload = putt?.payload as { yaw: number; speed: number; angle: number };
      expect(payload.speed).toBeGreaterThan(0);
      const lineYaw = (lockedLine as Extract<PuttClubInput, { type: "line" }>).payload.yaw;
      expect(payload.yaw).toBe(lineYaw);
      for (const input of inputs()) expect(inputSchema.safeParse(input).success).toBe(true);

      expect(text(wrapper)).toEqual({ status: "Putt away!", action: "—", hint: "Watch the TV" });
      expect(wrapper.find(".cc-big-action").classes()).toContain("cc-big-action--disabled");
    });

    it("lets go too early: unlocks and can lock again", async () => {
      const { wrapper, inputs } = mountController("pc-putt", view(), motion());
      pointer(button(wrapper), "pointerdown");
      await wrapper.vm.$nextTick();
      pointer(button(wrapper), "pointerup");
      await wrapper.vm.$nextTick();
      expect(inputs().at(-1)).toMatchObject({ type: "line", payload: { locked: false } });
      expect(text(wrapper)).toEqual({
        status: "Swing before you let go",
        action: "Hold to lock the line",
        hint: "Point at the TV to aim",
      });
      for (const input of inputs()) expect(inputSchema.safeParse(input).success).toBe(true);

      pointer(button(wrapper), "pointerdown");
      await wrapper.vm.$nextTick();
      expect(text(wrapper).status).toBe("Line locked");
    });

    it("a cancelled pointer unlocks too, and resets the swing detector", async () => {
      const { wrapper, inputs } = mountController("pc-putt", view(), motion());
      pointer(button(wrapper), "pointerdown");
      await wrapper.vm.$nextTick();
      pointer(button(wrapper), "pointercancel");
      await wrapper.vm.$nextTick();
      expect(inputs().at(-1)).toMatchObject({ type: "line", payload: { locked: false } });
    });

    it("never putts twice in a turn, and locks again in the next one", async () => {
      const adapter = createFakeAdapter();
      const m: PuttClubMotion = { mode: "motion", adapter, calibration };
      const { wrapper, inputs } = mountController("pc-putt", view({ turn: 1 }), m);
      pointer(button(wrapper), "pointerdown");
      for (const sample of puttBurst(performance.now(), 300, 600)) {
        vi.advanceTimersByTime(16);
        adapter.push(sample);
      }
      await wrapper.vm.$nextTick();
      expect(inputs().filter((input) => input.type === "putt")).toHaveLength(1);

      // A stray pointerup after the putt already sent does nothing more.
      pointer(button(wrapper), "pointerup");
      await wrapper.vm.$nextTick();
      expect(inputs().filter((input) => input.type === "line" && !input.payload.locked)).toEqual(
        [],
      );

      await wrapper.setProps({ screen: "pc-result", data: view({ turn: 1 }) });
      await wrapper.setProps({
        screen: "pc-putt",
        data: view({ turn: 2, stroke: 2, first: false }),
      });
      expect(text(wrapper).action).toBe("Hold to lock the line");
      pointer(button(wrapper), "pointerdown");
      for (const sample of puttBurst(performance.now(), 300, 600)) {
        vi.advanceTimersByTime(16);
        adapter.push(sample);
      }
      await wrapper.vm.$nextTick();
      expect(inputs().filter((input) => input.type === "putt")).toHaveLength(2);
      expect(
        inputs()
          .filter((input) => input.type === "putt")
          .at(-1),
      ).toMatchObject({
        payload: { turn: 2 },
      });
    });

    it("only the first finger locks", async () => {
      const { wrapper, inputs } = mountController("pc-putt", view(), motion());
      pointer(button(wrapper), "pointerdown", { pointerId: 1 });
      pointer(button(wrapper), "pointerdown", { pointerId: 2 });
      await wrapper.vm.$nextTick();
      expect(text(wrapper).status).toBe("Line locked");
      expect(inputs().filter((input) => input.type === "line")).toHaveLength(1);
    });

    it("drops a lock still held when the host moves on without a message", async () => {
      const { wrapper, inputs } = mountController("pc-putt", view({ turn: 1 }), motion());
      pointer(button(wrapper), "pointerdown");
      await wrapper.setProps({ screen: "pc-result", data: view({ turn: 1 }) });
      pointer(button(wrapper), "pointerup");
      expect(inputs().map((input) => input.type)).toEqual(["aim", "line"]);
    });
  });

  describe("touch fallback", () => {
    it.each([
      ["no motion result", undefined],
      ["motion denied or unsupported", { mode: "touch" } as const],
    ])("shows the aim pad and Centre with %s", (_case, motion) => {
      const { wrapper, inputs } = mountController("pc-putt", view({ first: false }), motion);
      expect(wrapper.find(".pad").exists()).toBe(true);
      expect(wrapper.find(".aim-pad button").text()).toBe("Centre");
      expect(text(wrapper)).toEqual({
        status: "Hole 4 · par 2 · stroke 1",
        action: "Hold to lock the line",
        hint: "Drag the pad to aim",
      });
      // The turn opened: the line starts on the flag.
      expect(inputs()).toEqual([{ type: "aim", payload: { yaw: 0, pitch: 0 } }]);
      expectShortText(wrapper);
    });

    it("aims with the pad, then swipes the big action to putt with the pad's aim", async () => {
      const { wrapper, inputs } = mountController("pc-putt", view(), { mode: "touch" });
      const pad = wrapper.find(".pad").element;
      pointer(pad, "pointerdown", { clientX: 100, clientY: 100, pointerId: 7 });
      pointer(pad, "pointermove", { clientX: 150, clientY: 100, pointerId: 7 });
      pointer(pad, "pointerup", { clientX: 150, clientY: 100, pointerId: 7 });
      await wrapper.vm.$nextTick();

      const big = button(wrapper);
      pointer(big, "pointerdown", { clientY: 300, pointerId: 1 });
      await wrapper.vm.$nextTick();
      expect(text(wrapper).action).toBe("Swipe up to putt");
      const lockedLine = inputs()
        .filter((input) => input.type === "line")
        .at(-1);
      expect(lockedLine).toMatchObject({ type: "line", payload: { locked: true } });

      pointer(big, "pointermove", { clientY: 230, pointerId: 1 });
      pointer(big, "pointerup", { clientY: 225, pointerId: 1 });
      await wrapper.vm.$nextTick();

      const putt = inputs().find((input) => input.type === "putt");
      expect(putt).toBeDefined();
      const lineYaw = (lockedLine as Extract<PuttClubInput, { type: "line" }>).payload.yaw;
      expect(lineYaw).not.toBe(0);
      expect((putt as Extract<PuttClubInput, { type: "putt" }>).payload.yaw).toBe(lineYaw);
      for (const input of inputs()) expect(inputSchema.safeParse(input).success).toBe(true);
      expect(wrapper.find(".pad").exists()).toBe(false);
    });

    it("the Centre button sets the aim back to the flag, and a lock right after still uses it", async () => {
      const { wrapper, inputs } = mountController("pc-putt", view(), { mode: "touch" });
      const pad = wrapper.find(".pad").element;
      pointer(pad, "pointerdown", { clientX: 100, clientY: 100 });
      pointer(pad, "pointermove", { clientX: 100, clientY: 70 });
      pointer(pad, "pointerup", { clientX: 100, clientY: 70 });
      pointer(wrapper.find(".aim-pad button").element, "pointerdown");
      await wrapper.vm.$nextTick();

      pointer(button(wrapper), "pointerdown", { clientY: 300 });
      await wrapper.vm.$nextTick();
      expect(
        inputs()
          .filter((input) => input.type === "line")
          .at(-1),
      ).toMatchObject({
        payload: { yaw: 0 },
      });
    });

    it("a swipe short of 60px unlocks instead of putting", async () => {
      const { wrapper, inputs } = mountController("pc-putt", view(), { mode: "touch" });
      const big = button(wrapper);
      pointer(big, "pointerdown", { clientY: 300 });
      await wrapper.vm.$nextTick();
      pointer(big, "pointerup", { clientY: 290 });
      await wrapper.vm.$nextTick();
      expect(inputs().filter((input) => input.type === "putt")).toEqual([]);
      expect(inputs().at(-1)).toMatchObject({ type: "line", payload: { locked: false } });
      expect(text(wrapper).status).toBe("Swipe further up");
    });

    it("switches to the pad when motion stops mid-match", async () => {
      const adapter = createFakeAdapter();
      const { wrapper } = mountController("pc-putt", view(), {
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
    const { wrapper, sent } = mountController("pc-putt", view(), {
      mode: "motion",
      adapter,
      calibration,
    });
    pointer(button(wrapper), "pointerdown");
    const before = sent.length;
    wrapper.unmount();
    for (const sample of puttBurst(performance.now(), 300, 600)) adapter.push(sample);
    vi.advanceTimersByTime(1000);
    expect(sent.length).toBe(before);
  });
});
