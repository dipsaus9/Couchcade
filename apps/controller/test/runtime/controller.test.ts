import { readFileSync } from "node:fs";
import { createControllerRegistry } from "@couchcade/game-sdk/registry";
import { calibrateRest, type Calibration } from "@couchcade/motion/calibration";
import { createFakeAdapter, synthetic, traceSamples } from "@couchcade/motion/sensors";
import type { ControllerView, PlayerInfo, RelayToPhoneMessage } from "@couchcade/protocol";
import { describe, expect, it, vi } from "vitest";
import { createSSRApp, h, nextTick, ref } from "vue";
import { renderToString } from "vue/server-renderer";
import type { MotionGame } from "../../src/motion/session.ts";
import {
  controllerMotion,
  controllerProps,
  showsGameController,
  useGameController,
  type GameState,
} from "../../src/runtime/controller.ts";
import { missingGameCopy } from "../../src/runtime/copy.ts";
import { createInputSender } from "../../src/runtime/send.ts";
import { initialState, reduce, type PhoneState } from "../../src/session/state.ts";

// Laid out like the app's glob over games/*/src/controller/index.ts, with a test-only game.
const registry = createControllerRegistry(
  import.meta.glob("./fixtures/games/*/src/controller/index.ts", { import: "default" }),
);

const sam: PlayerInfo = {
  id: "ABCDEFGH",
  name: "Sam",
  slot: 0,
  profile: { skin: 0, hair: 0, hairColour: 0 },
  joinedAt: 1_789_000_000_000,
  connected: true,
};

function roomWith(...messages: RelayToPhoneMessage[]): PhoneState {
  const start = initialState(null, { code: "BEAN", playerId: sam.id, rejoinToken: "r.sig" });
  const welcome: RelayToPhoneMessage = {
    t: "room:welcome",
    d: { role: "player", code: "BEAN", phase: "playing", you: sam },
  };
  return [welcome, ...messages].reduce(
    (state, message) => reduce(state, { type: "message", message }),
    start,
  );
}

const tapView: ControllerView = { screen: "tap", data: { round: 2, ready: true } };
const gameState = (gameId: string | null, view = tapView) =>
  roomWith({ t: "controller:state", d: { gameId, view } });

const flush = async () => {
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve, 0));
  await nextTick();
};

describe("the phone registry", () => {
  it("globs only each game's controller entry, never its src/index.ts", () => {
    const source = readFileSync(new URL("../../src/runtime/games.ts", import.meta.url), "utf8");
    expect(source).toContain('import.meta.glob("../../../../games/*/src/controller/index.ts"');
    expect(source).not.toMatch(/games\/\*\/src\/index\.ts/);
    expect(registry.ids).toEqual(["tap-race"]);
  });
});

describe("showsGameController", () => {
  it("shows the controller for a game view while the socket and the TV are there", () => {
    expect(showsGameController(gameState("tap-race"))).toBe(true);
    expect(showsGameController(gameState(null, { screen: "lobby", data: null }))).toBe(false);
    expect(showsGameController(roomWith())).toBe(false);

    const state = gameState("tap-race");
    expect(showsGameController(reduce(state, { type: "socket-lost" }))).toBe(false);
    const hostAway = reduce(state, {
      type: "message",
      message: { t: "room:host", d: { connected: false } },
    });
    expect(showsGameController(hostAway)).toBe(false);
  });
});

describe("useGameController", () => {
  it("lazy-loads the running game's controller component by id", async () => {
    const load = vi.spyOn(registry, "load");
    const status = useGameController(() => "tap-race", registry);
    expect(status.value).toEqual({ kind: "loading", gameId: "tap-race" });

    await vi.waitFor(() =>
      expect(status.value).toMatchObject({ kind: "ready", gameId: "tap-race" }),
    );
    expect(load).toHaveBeenCalledWith("tap-race");
    load.mockRestore();
  });

  it("ends as missing for a game id this phone doesn't have", async () => {
    const status = useGameController(() => "quick-draw", registry);
    await flush();
    expect(status.value).toEqual({ kind: "missing", gameId: "quick-draw" });
  });

  it("ends as missing when the controller's code fails to load", async () => {
    const broken = {
      load: () =>
        Promise.resolve({ id: "tap-race", component: () => Promise.reject(new Error("chunk")) }),
    };
    const status = useGameController(() => "tap-race", broken);
    await flush();
    expect(status.value).toEqual({ kind: "missing", gameId: "tap-race" });
  });

  it("follows the running game and ignores a load for a game that already ended", async () => {
    const gameId = ref("tap-race");
    let finishSlow: (() => void) | undefined;
    const slow = {
      load: (id: string) =>
        id === "tap-race"
          ? new Promise<never>((_, reject) => {
              finishSlow = () => reject(new Error("late"));
            })
          : registry.load("tap-race"),
    };
    const status = useGameController(() => gameId.value, slow);

    gameId.value = "other-game";
    await vi.waitFor(() =>
      expect(status.value).toMatchObject({ kind: "ready", gameId: "other-game" }),
    );

    finishSlow?.();
    await flush();
    expect(status.value).toMatchObject({ kind: "ready", gameId: "other-game" });
  });
});

describe("controllerProps", () => {
  it("passes the controller:state view, the player and the send helper to the component", async () => {
    const state = gameState("tap-race") as GameState;
    const send = createInputSender({ sendMessage: () => {}, canSend: () => true });
    const props = controllerProps(state, send);
    expect(props).toEqual({ screen: "tap", data: { round: 2, ready: true }, player: sam, send });

    const entry = await registry.load("tap-race");
    const component = await entry.component();
    const html = await renderToString(createSSRApp({ render: () => h(component, { ...props }) }));
    expect(html).toContain("Sam tap {&quot;round&quot;:2,&quot;ready&quot;:true}");
  });

  it("gives the component the next view when the host sends one", () => {
    const next = reduce(gameState("tap-race"), {
      type: "message",
      message: {
        t: "controller:state",
        d: { gameId: "tap-race", view: { screen: "done", data: 3 } },
      },
    }) as GameState;
    const send = createInputSender({ sendMessage: () => {}, canSend: () => true });
    expect(controllerProps(next, send)).toMatchObject({ screen: "done", data: 3 });
  });
});

describe("copy", () => {
  it("says an unknown game needs a reload, in the referee voice", () => {
    expect(`${missingGameCopy.title} ${missingGameCopy.body}`).toBe(
      "That game isn't on this phone yet. Reload the page.",
    );
  });
});

describe("controllerMotion", () => {
  const adapter = createFakeAdapter();
  const calibration = calibrateRest(
    traceSamples(synthetic.still({ durationMs: 1500, gravity: [0, 0, 9.81] })),
  ) as Calibration;
  const game = (patch: Partial<MotionGame> = {}): MotionGame => ({
    step: 1,
    gameId: "tap-race",
    title: "Tap race",
    flow: { kind: "ready" },
    calibration,
    capability: "full",
    playing: true,
    paused: false,
    ...patch,
  });

  it("hands a calibrated phone's adapter and calibration to the running game", () => {
    expect(controllerMotion(game(), "tap-race", () => adapter)).toEqual({
      mode: "motion",
      adapter,
      calibration,
    });
    // A sleeping phone keeps motion: "Tap to resume" restarts the same adapter.
    expect(controllerMotion(game({ paused: true }), "tap-race", () => adapter)?.mode).toBe(
      "motion",
    );
  });

  it("is touch for every other outcome of the motion step", () => {
    const touch = { mode: "touch" };
    for (const reason of ["denied", "unsupported"] as const) {
      const flow = { kind: "touch", reason, acknowledged: true } as const;
      expect(
        controllerMotion(game({ flow, calibration: null }), "tap-race", () => adapter),
      ).toEqual(touch);
    }
    for (const flow of [{ kind: "ask" }, { kind: "starting" }] as const) {
      expect(
        controllerMotion(game({ flow, calibration: null }), "tap-race", () => adapter),
      ).toEqual(touch);
    }
  });

  it("is absent without a motion step for this game", () => {
    expect(controllerMotion(null, "tap-race", () => adapter)).toBeUndefined();
    expect(controllerMotion(game({ gameId: "other" }), "tap-race", () => adapter)).toBeUndefined();
  });

  it("is passed to the controller component only when there is one", () => {
    const state = gameState("tap-race") as GameState;
    const send = createInputSender({ sendMessage: () => {}, canSend: () => true });
    expect(controllerProps(state, send)).not.toHaveProperty("motion");
    expect(controllerProps(state, send, { mode: "touch" })).toMatchObject({
      screen: "tap",
      motion: { mode: "touch" },
    });
  });
});
