import { describe, expect, it } from "vitest";
import { audioLimits, createAudio, defineSounds, soundTokens, stepGain } from "../src/index.ts";
import type { SoundToken } from "../src/index.ts";
import { buses, fakeFetch, firstCurve, gainAfter, settle, setup } from "./fake-context.ts";

const tokens = defineSounds(
  "platform",
  Object.fromEntries(
    soundTokens.map((token) => [
      token,
      { src: `/audio/${token}.ogg`, bus: "effects" as const, visual: `${token} motion` },
    ]),
  ) as Record<SoundToken, { src: string; bus: "effects"; visual: string }>,
);

const game = defineSounds("quick-draw", {
  drawSting: { src: "/qd/draw.ogg", bus: "effects", duck: true, visual: "DRAW! callout" },
  wind: { src: "/qd/wind.ogg", bus: "effects", loop: true, gain: 0.6, visual: "Blowing dust" },
  loop: { src: "/qd/loop.ogg", bus: "music", visual: "Round chip lifts" },
});

const lobby = defineSounds("platform-music", {
  loop: {
    src: "/audio/lobby-loop.ogg",
    bus: "music",
    loop: { startS: 0.05, endS: 22.1 },
    visual: "Lobby screen",
  },
});

describe("unlock", () => {
  it("creates no AudioContext until unlock, then one only", async () => {
    let created = 0;
    const { audio, ctx } = setup({
      createContext: () => {
        created++;
        return ctx;
      },
    });
    audio.setTokens(tokens);
    audio.play("press");
    expect(created).toBe(0);
    expect(audio.state).toBe("locked");
    audio.unlock();
    audio.unlock();
    expect(created).toBe(1);
  });

  it("resumes a suspended context inside the gesture and plays a silent sample", async () => {
    const { audio, ctx } = setup();
    const states: string[] = [];
    audio.onStateChange((state) => states.push(state));
    audio.unlock();
    expect(ctx.resumeCalls).toBe(1);
    expect(ctx.sources[0]?.started).toEqual({ when: 0, offset: 0 });
    expect(ctx.sources[0]?.outputs).toEqual([ctx.destination]);
    expect(audio.state).toBe("locked");
    ctx.setState("running");
    expect(audio.state).toBe("running");
    expect(states).toEqual(["running"]);
  });

  it("goes back to locked when the context is suspended or interrupted", async () => {
    const { audio, ctx, unlock } = setup();
    await unlock();
    ctx.setState("interrupted");
    expect(audio.state).toBe("locked");
    ctx.setState("running");
    ctx.setState("suspended");
    expect(audio.state).toBe("locked");
  });

  it("is unsupported without an AudioContext, and every call is a silent no-op", async () => {
    const audio = createAudio({ createContext: null, fetch: fakeFetch().fetch });
    expect(audio.state).toBe("unsupported");
    expect(() => {
      audio.unlock();
      audio.setTokens(tokens);
      audio.play("celebrate").stop(100);
      audio.music(lobby.refs.loop);
      audio.duck()();
      audio.setVolumes({ muted: true, music: 3, effects: 3 });
      audio.unload(tokens);
    }).not.toThrow();
    await expect(audio.load(game)).resolves.toBeUndefined();
    expect(audio.state).toBe("unsupported");
  });

  it("is unsupported when constructing the AudioContext throws", () => {
    const audio = createAudio({
      createContext: () => {
        throw new Error("no audio device");
      },
    });
    expect(audio.state).toBe("locked");
    expect(() => audio.unlock()).not.toThrow();
    expect(audio.state).toBe("unsupported");
  });

  it("finds no AudioContext in Node, so the default instance is unsupported", () => {
    expect(createAudio().state).toBe("unsupported");
  });
});

describe("tokens and banks", () => {
  it("plays every token after setTokens", async () => {
    const { audio, ctx, unlock } = setup();
    audio.setTokens(tokens);
    await unlock();
    for (const token of soundTokens) {
      audio.play(token);
      expect(ctx.playing(`/audio/${token}.ogg`)).toHaveLength(1);
    }
    const { effects } = buses(ctx);
    expect(gainAfter(ctx.playing("/audio/press.ogg")[0]).outputs).toEqual([effects]);
  });

  it("drops a sound played before unlock, and doesn't play it later", async () => {
    const { audio, ctx, unlock } = setup();
    audio.setTokens(tokens);
    await settle();
    audio.play("celebrate");
    await unlock();
    expect(ctx.playing("/audio/celebrate.ogg")).toHaveLength(0);
    audio.play("celebrate");
    expect(ctx.playing("/audio/celebrate.ogg")).toHaveLength(1);
  });

  it("fetches a bank while locked and decodes it at unlock", async () => {
    const { audio, ctx, requests, unlock } = setup();
    await audio.load(game);
    expect(requests).toEqual(["/qd/draw.ogg", "/qd/wind.ogg", "/qd/loop.ogg"]);
    await unlock();
    audio.play(game.refs.drawSting);
    expect(ctx.playing("/qd/draw.ogg")).toHaveLength(1);
  });

  it("drops a sound played before its file has decoded", async () => {
    const { audio, ctx, unlock } = setup();
    await unlock();
    const loading = audio.load(game);
    audio.play(game.refs.drawSting);
    await loading;
    expect(ctx.playing("/qd/draw.ogg")).toHaveLength(0);
    audio.play(game.refs.drawSting);
    expect(ctx.playing("/qd/draw.ogg")).toHaveLength(1);
  });

  it("keeps a file that fails to decode silent and warns with its URL", async () => {
    const { audio, ctx, warnings, unlock } = setup();
    ctx.undecodable.add("/qd/wind.ogg");
    await unlock();
    await expect(audio.load(game)).resolves.toBeUndefined();
    expect(audio.play(game.refs.wind)).toBeDefined();
    expect(ctx.playing("/qd/wind.ogg")).toHaveLength(0);
    audio.play(game.refs.drawSting);
    expect(ctx.playing("/qd/draw.ogg")).toHaveLength(1);
    expect(warnings).toEqual(["[audio] could not decode /qd/wind.ogg"]);
  });

  it("warns once for a bank when nothing decodes (Safari before 18.4)", async () => {
    const { audio, ctx, warnings, unlock } = setup();
    for (const token of soundTokens) ctx.undecodable.add(`/audio/${token}.ogg`);
    audio.setTokens(tokens);
    await unlock();
    audio.play("celebrate");
    expect(ctx.playing("/audio/celebrate.ogg")).toHaveLength(0);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("Ogg Vorbis");
  });

  it("keeps a file that fails to fetch silent and warns with its URL", async () => {
    const { audio, warnings, unlock } = setup({
      fetch: fakeFetch(new Set(["/qd/draw.ogg"])).fetch,
    });
    await unlock();
    await audio.load(game);
    expect(warnings).toEqual(["[audio] could not fetch /qd/draw.ogg"]);
  });

  it("unload stops the bank's sounds and frees its buffers", async () => {
    const { audio, ctx, unlock } = setup();
    await unlock();
    await audio.load(game);
    audio.play(game.refs.wind);
    audio.music(game.refs.loop);
    const [wind] = ctx.playing("/qd/wind.ogg");
    const [loop] = ctx.playing("/qd/loop.ogg");
    audio.unload(game);
    expect(wind?.stoppedAt).toBe(0);
    expect(loop?.stoppedAt).toBe(0);
    audio.play(game.refs.drawSting);
    expect(ctx.playing("/qd/draw.ogg")).toHaveLength(0);
  });

  it("loads a bank once while it stays loaded, and again after unload", async () => {
    const { audio, requests, unlock } = setup();
    await unlock();
    await Promise.all([audio.load(game), audio.load(game)]);
    expect(requests).toHaveLength(3);
    audio.unload(game);
    await audio.load(game);
    expect(requests).toHaveLength(6);
  });

  it("levels a sound with its def gain and the play gain, and loops a looping effect", async () => {
    const { audio, ctx, unlock } = setup();
    await unlock();
    await audio.load(game);
    audio.play(game.refs.wind, { gain: 0.5 });
    const [wind] = ctx.playing("/qd/wind.ogg");
    expect(wind?.loop).toBe(true);
    expect(gainAfter(wind).gain.value).toBeCloseTo(0.3);
  });

  it("stops a sound through its handle, with a fade", async () => {
    const { audio, ctx, unlock } = setup();
    await unlock();
    await audio.load(game);
    const handle = audio.play(game.refs.wind);
    ctx.currentTime = 2;
    handle.stop(150);
    const [wind] = ctx.playing("/qd/wind.ogg");
    expect(wind?.stoppedAt).toBeCloseTo(2.15);
    expect(gainAfter(wind).gain.events).toContainEqual({ type: "ramp", value: 0, time: 2.15 });
  });
});

describe("voices", () => {
  it("plays the same sound started twice within 30 ms once", async () => {
    const { audio, ctx, unlock } = setup();
    audio.setTokens(tokens);
    await unlock();
    ctx.currentTime = 1;
    audio.play("press");
    ctx.currentTime = 1.02;
    audio.play("press");
    expect(ctx.playing("/audio/press.ogg")).toHaveLength(1);
    ctx.currentTime = 1.04;
    audio.play("press");
    expect(ctx.playing("/audio/press.ogg")).toHaveLength(2);
  });

  it("drops a seventeenth effect while sixteen play", async () => {
    const { audio, ctx, unlock } = setup();
    audio.setTokens(tokens);
    await unlock();
    for (let i = 0; i < audioLimits.maxEffectVoices + 1; i++) {
      ctx.currentTime = i;
      audio.play("ui");
    }
    const playing = ctx.playing("/audio/ui.ogg");
    expect(playing).toHaveLength(16);
    playing[0]?.end();
    audio.play("ui");
    expect(ctx.playing("/audio/ui.ogg")).toHaveLength(17);
  });
});

describe("ducking", () => {
  it("ducks the music to 0.5 in 50 ms for a stinger and back over 300 ms when it ends", async () => {
    const { audio, ctx, unlock } = setup();
    audio.setTokens(tokens);
    await unlock();
    const { duck } = buses(ctx);
    ctx.currentTime = 1;
    audio.play("celebrate");
    expect(duck.gain.events.at(-1)).toEqual({ type: "ramp", value: 0.5, time: 1.05 });
    ctx.currentTime = 2;
    ctx.playing("/audio/celebrate.ogg")[0]?.end();
    expect(duck.gain.events.at(-1)).toEqual({ type: "ramp", value: 1, time: 2.3 });
  });

  it("ducks for your-turn, celebrate, foul and duck: true refs, never press, ui or scene", async () => {
    const { audio, ctx, unlock } = setup();
    audio.setTokens(tokens);
    await unlock();
    await audio.load(game);
    const { duck } = buses(ctx);
    const ducked = (play: () => void) => {
      ctx.currentTime += 1;
      play();
      const value = duck.gain.value;
      for (const source of ctx.sources) source.end();
      return value;
    };
    expect(ducked(() => audio.play("press"))).toBe(1);
    expect(ducked(() => audio.play("ui"))).toBe(1);
    expect(ducked(() => audio.play("scene"))).toBe(1);
    expect(ducked(() => audio.play("your-turn"))).toBe(0.5);
    expect(ducked(() => audio.play("celebrate"))).toBe(0.5);
    expect(ducked(() => audio.play("foul"))).toBe(0.5);
    expect(ducked(() => audio.play(tokens.refs.foul))).toBe(0.5);
    expect(ducked(() => audio.play(game.refs.drawSting))).toBe(0.5);
    expect(ducked(() => audio.play(game.refs.wind))).toBe(1);
  });

  it("counts overlapping ducks and comes back up only after the last release", async () => {
    const { audio, ctx, unlock } = setup();
    await unlock();
    const { duck } = buses(ctx);
    const first = audio.duck();
    const second = audio.duck();
    expect(duck.gain.value).toBe(0.5);
    first();
    first();
    expect(duck.gain.value).toBe(0.5);
    second();
    expect(duck.gain.value).toBe(1);
  });

  it("releases a duck after holdMs, and a forgotten one after 10 s with a warning", async () => {
    const { audio, ctx, warnings, run, unlock } = setup();
    await unlock();
    const { duck } = buses(ctx);
    audio.duck({ holdMs: 1_200, level: 0.3 });
    expect(duck.gain.value).toBe(0.3);
    run(1_200);
    expect(duck.gain.value).toBe(1);
    expect(warnings).toEqual([]);

    audio.duck();
    run(9_999);
    expect(duck.gain.value).toBe(0.5);
    run(1);
    expect(duck.gain.value).toBe(1);
    expect(warnings).toHaveLength(1);
  });

  it("applies a duck taken while locked once the graph exists", async () => {
    const { audio, ctx, unlock } = setup();
    const release = audio.duck();
    await unlock();
    expect(buses(ctx).duck.gain.value).toBe(0.5);
    release();
    expect(buses(ctx).duck.gain.value).toBe(1);
  });
});

describe("volume", () => {
  it("starts at the owner defaults: music 6, effects 8, not muted", async () => {
    const { ctx, unlock } = setup();
    await unlock();
    const { master, effects, music } = buses(ctx);
    expect(master.gain.value).toBe(1);
    expect(music.gain.value).toBeCloseTo(0.36);
    expect(effects.gain.value).toBeCloseTo(0.64);
  });

  it("maps steps to (step / 10) ** 2 and ramps over 30 ms", async () => {
    const { audio, ctx, unlock } = setup();
    await unlock();
    ctx.currentTime = 5;
    audio.setVolumes({ muted: false, music: 10, effects: 3 });
    const { music, effects } = buses(ctx);
    expect(music.gain.events.at(-1)).toEqual({ type: "ramp", value: 1, time: 5.03 });
    expect(effects.gain.value).toBeCloseTo(0.09);
    expect(stepGain(-1)).toBe(0);
    expect(stepGain(12)).toBe(1);
  });

  it("mute sets master to 0 and keeps the music playing", async () => {
    const { audio, ctx, unlock } = setup();
    await audio.load(lobby);
    await unlock();
    audio.music(lobby.refs.loop);
    audio.setVolumes({ muted: true, music: 6, effects: 8 });
    const { master } = buses(ctx);
    expect(master.gain.events.at(-1)).toEqual({ type: "ramp", value: 0, time: 0.03 });
    expect(ctx.playing("/audio/lobby-loop.ogg")[0]?.stoppedAt).toBeNull();
    audio.setVolumes({ muted: false, music: 6, effects: 8 });
    expect(master.gain.value).toBe(1);
  });

  it("applies volumes set before unlock", async () => {
    const { audio, ctx, unlock } = setup();
    audio.setVolumes({ muted: true, music: 0, effects: 10 });
    await unlock();
    const { master, music, effects } = buses(ctx);
    expect([master.gain.value, music.gain.value, effects.gain.value]).toEqual([0, 0, 1]);
  });
});

describe("music", () => {
  it("loops a track gaplessly from its buffer with its loop points, through the duck", async () => {
    const { audio, ctx, unlock } = setup();
    await unlock();
    await audio.load(lobby);
    audio.music(lobby.refs.loop);
    const [source] = ctx.playing("/audio/lobby-loop.ogg");
    expect(source?.loop).toBe(true);
    expect([source?.loopStart, source?.loopEnd]).toEqual([0.05, 22.1]);
    expect(source?.started?.offset).toBe(0.05);
    expect(gainAfter(gainAfter(source)).outputs).toEqual([buses(ctx).duck]);
  });

  it("crossfades over 800 ms with an equal-power curve and stops the old source", async () => {
    const { audio, ctx, unlock } = setup();
    await unlock();
    await Promise.all([audio.load(lobby), audio.load(game)]);
    audio.music(lobby.refs.loop);
    ctx.currentTime = 10;
    audio.music(game.refs.loop);

    const [old] = ctx.playing("/audio/lobby-loop.ogg");
    const [next] = ctx.playing("/qd/loop.ogg");
    expect(old?.stoppedAt).toBeCloseTo(10.8);
    expect(next?.started?.when).toBe(10);
    const curve = firstCurve(gainAfter(next).gain);
    expect([curve.time, curve.duration]).toEqual([10, 0.8]);
    // Equal power: halfway through, each side is at about 0.707, not 0.5.
    expect(curve.values[0]).toBe(0);
    expect(curve.values.at(-1)).toBeCloseTo(1);
    const middle = curve.values[Math.round((curve.values.length - 1) / 2)] ?? 0;
    expect(middle).toBeGreaterThan(0.69);
    expect(middle).toBeLessThan(0.72);
    expect(firstCurve(gainAfter(gainAfter(old)).gain)).toMatchObject({
      type: "curve",
      time: 10,
      duration: 0.8,
    });
  });

  it("ignores the track that is already playing", async () => {
    const { audio, ctx, unlock } = setup();
    await unlock();
    await audio.load(lobby);
    audio.music(lobby.refs.loop);
    audio.music(lobby.refs.loop);
    expect(ctx.playing("/audio/lobby-loop.ogg")).toHaveLength(1);
  });

  it("fades to silence with null, and starts a track again from its beginning", async () => {
    const { audio, ctx, unlock } = setup();
    await unlock();
    await audio.load(lobby);
    audio.music(lobby.refs.loop);
    ctx.currentTime = 4;
    audio.music(null, { fadeMs: 400 });
    expect(ctx.playing("/audio/lobby-loop.ogg")[0]?.stoppedAt).toBeCloseTo(4.4);
    audio.music(lobby.refs.loop);
    const sources = ctx.playing("/audio/lobby-loop.ogg");
    expect(sources).toHaveLength(2);
    expect(sources[1]?.started).toEqual({ when: 4, offset: 0.05 });
  });

  it("starts a track still loading once it decodes", async () => {
    const { audio, ctx, unlock } = setup();
    await unlock();
    audio.music(lobby.refs.loop);
    expect(ctx.playing("/audio/lobby-loop.ogg")).toHaveLength(0);
    await audio.load(lobby);
    expect(ctx.playing("/audio/lobby-loop.ogg")).toHaveLength(1);
  });

  it("starts a track asked for before unlock once audio unlocks and it decodes", async () => {
    const { audio, ctx, unlock } = setup();
    audio.music(lobby.refs.loop);
    await audio.load(lobby);
    await unlock();
    expect(ctx.playing("/audio/lobby-loop.ogg")).toHaveLength(1);
  });

  it("doesn't start a loading track when another was asked for meanwhile", async () => {
    const { audio, ctx, unlock } = setup();
    await unlock();
    await audio.load(game);
    audio.music(lobby.refs.loop);
    audio.music(game.refs.loop);
    await audio.load(lobby);
    expect(ctx.playing("/audio/lobby-loop.ogg")).toHaveLength(0);
    expect(ctx.playing("/qd/loop.ogg")).toHaveLength(1);
  });

  it("doesn't start a loading track after music(null)", async () => {
    const { audio, ctx, unlock } = setup();
    await unlock();
    audio.music(lobby.refs.loop);
    audio.music(null);
    await audio.load(lobby);
    expect(ctx.playing("/audio/lobby-loop.ogg")).toHaveLength(0);
  });
});
