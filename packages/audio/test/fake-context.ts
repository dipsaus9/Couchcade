/**
 * A fake `AudioContext` that records what the engine does: gain values and their automation,
 * source starts, stops and loop points. Time only moves when a test sets `currentTime`.
 */
import type {
  AudioBufferLike,
  AudioContextLike,
  AudioNodeLike,
  AudioParamLike,
  BufferSourceLike,
  FetchLike,
  GainNodeLike,
} from "../src/index.ts";
import { createAudio } from "../src/index.ts";
import type { AudioOptions } from "../src/index.ts";

export type Automation =
  | { type: "set"; value: number; time: number }
  | { type: "ramp"; value: number; time: number }
  | { type: "curve"; values: number[]; time: number; duration: number }
  | { type: "cancel"; time: number };

export class FakeParam implements AudioParamLike {
  value: number;
  readonly events: Automation[] = [];

  constructor(value = 1) {
    this.value = value;
  }

  setValueAtTime(value: number, time: number) {
    this.events.push({ type: "set", value, time });
  }

  linearRampToValueAtTime(value: number, time: number) {
    this.events.push({ type: "ramp", value, time });
    // The fake jumps to the ramp's end value, so later reads see where the ramp goes.
    this.value = value;
  }

  setValueCurveAtTime(values: Float32Array<ArrayBuffer>, time: number, duration: number) {
    this.events.push({ type: "curve", values: [...values], time, duration });
    this.value = values.at(-1) ?? this.value;
  }

  cancelScheduledValues(time: number) {
    this.events.push({ type: "cancel", time });
  }
}

export class FakeNode implements AudioNodeLike {
  readonly outputs: FakeNode[] = [];
  disconnected = false;

  connect(destination: AudioNodeLike) {
    this.outputs.push(destination as FakeNode);
    return destination;
  }

  disconnect() {
    this.disconnected = true;
  }
}

export class FakeGain extends FakeNode implements GainNodeLike {
  readonly gain = new FakeParam(1);
}

export class FakeSource extends FakeNode implements BufferSourceLike {
  buffer: AudioBufferLike | null = null;
  loop = false;
  loopStart = 0;
  loopEnd = 0;
  #endedListeners: Array<() => void> = [];
  started: { when: number; offset: number } | null = null;
  stoppedAt: number | null = null;

  start(when = 0, offset = 0) {
    this.started = { when, offset };
  }

  stop(when = 0) {
    this.stoppedAt = when;
  }

  addEventListener(_type: "ended", listener: () => void) {
    this.#endedListeners.push(listener);
  }

  /** What the browser does when the sound ends or its `stop` time passes. */
  end() {
    for (const listener of this.#endedListeners) listener();
  }
}

export class FakeBuffer implements AudioBufferLike {
  readonly name: string;
  readonly duration: number;

  constructor(name: string, duration = 0.5) {
    this.name = name;
    this.duration = duration;
  }
}

export class FakeContext implements AudioContextLike {
  state = "suspended";
  currentTime = 0;
  readonly destination = new FakeNode();
  #stateListeners: Array<() => void> = [];
  readonly gains: FakeGain[] = [];
  readonly sources: FakeSource[] = [];
  resumeCalls = 0;
  /** Names of files that fail to decode. */
  readonly undecodable = new Set<string>();

  createGain() {
    const gain = new FakeGain();
    this.gains.push(gain);
    return gain;
  }

  createBufferSource() {
    const source = new FakeSource();
    this.sources.push(source);
    return source;
  }

  createBuffer() {
    return new FakeBuffer("silence", 0);
  }

  decodeAudioData(data: ArrayBuffer) {
    const name = new TextDecoder().decode(data);
    return this.undecodable.has(name)
      ? Promise.reject(new Error("EncodingError"))
      : Promise.resolve(new FakeBuffer(name));
  }

  addEventListener(_type: "statechange", listener: () => void) {
    this.#stateListeners.push(listener);
  }

  resume() {
    this.resumeCalls++;
    return Promise.resolve();
  }

  /** The browser moving the context to `state`. */
  setState(state: string) {
    this.state = state;
    for (const listener of this.#stateListeners) listener();
  }

  /** Sources that play `name` (the file URL), in start order. */
  playing(name: string): FakeSource[] {
    return this.sources.filter(
      (source) => source.started && (source.buffer as FakeBuffer | null)?.name === name,
    );
  }
}

/** A fetch that serves every URL as a file whose bytes are its URL, except `missing` ones. */
export function fakeFetch(missing: Set<string> = new Set()) {
  const requests: string[] = [];
  const fetch: FetchLike = async (url) => {
    requests.push(url);
    return {
      ok: !missing.has(url),
      arrayBuffer: async () => new TextEncoder().encode(url).buffer,
    };
  };
  return { fetch, requests };
}

/** Lets pending fetches and decodes settle. */
export async function settle(): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

/** A test engine over a fake context, fetch and timers. `run(ms)` fires timers due within `ms`. */
export function setup(options: AudioOptions = {}) {
  const ctx = new FakeContext();
  const { fetch, requests } = fakeFetch();
  const warnings: string[] = [];
  let clock = 0;
  const timers: Array<{ at: number; callback: () => void; cancelled: boolean }> = [];
  const audio = createAudio({
    createContext: () => ctx,
    fetch,
    warn: (message) => warnings.push(message),
    setTimer: (callback, ms) => {
      const timer = { at: clock + ms, callback, cancelled: false };
      timers.push(timer);
      return () => {
        timer.cancelled = true;
      };
    },
    ...options,
  });
  const run = (ms: number) => {
    clock += ms;
    for (const timer of timers.filter((t) => !t.cancelled && t.at <= clock)) {
      timer.cancelled = true;
      timer.callback();
    }
  };
  /** Unlocks inside a pretend gesture: the context starts running. */
  const unlock = async () => {
    ctx.state = "running";
    audio.unlock();
    await settle();
  };
  return { audio, ctx, requests, warnings, run, unlock };
}

/** The engine's buses, found through the graph the fake recorded. */
export function buses(ctx: FakeContext) {
  const [master, effects, duck, music] = ctx.gains;
  if (!master || !effects || !duck || !music) throw new Error("the graph isn't built");
  return { master, effects, duck, music };
}

/** The gain node `node` feeds. The engine connects every node it makes to exactly one output. */
export function gainAfter(node: FakeNode | undefined): FakeGain {
  const output = node?.outputs[0];
  if (!(output instanceof FakeGain)) throw new Error("the node doesn't feed a gain node");
  return output;
}

/** The first value curve scheduled on `param`. */
export function firstCurve(param: FakeParam) {
  const curve = param.events.find((event) => event.type === "curve");
  if (!curve) throw new Error("no curve scheduled");
  return curve;
}
