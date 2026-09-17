/**
 * The TV's one mixer over the plain Web Audio API (docs/architecture/audio.md, "Engine", "Mixer",
 * "Music loops and crossfades", "Unlocking audio" and "Loading, formats and size").
 *
 * ```
 * effect source → per-sound gain → effects bus ─┐
 * music source → fade in → fade out → duck → music bus ─┴→ master (0 when muted) → destination
 * ```
 *
 * Sound never throws into game code: where there is no `AudioContext`, every call is a no-op.
 */
import type { SoundBank, SoundRef } from "./bank.ts";
import type {
  AudioBufferLike,
  AudioContextLike,
  AudioParamLike,
  BufferSourceLike,
  FetchLike,
  GainNodeLike,
} from "./context.ts";
import { duckingTokens } from "./tokens.ts";
import type { SoundToken } from "./tokens.ts";

export type AudioState = "locked" | "running" | "unsupported";

/** The host settings for sound. `music` and `effects` are whole steps from 0 to 10. */
export interface Volumes {
  muted: boolean;
  music: number;
  effects: number;
}

export interface SoundHandle {
  /** Stops the sound, fading out over `fadeMs` when given. */
  stop(fadeMs?: number): void;
}

export interface Audio {
  readonly state: AudioState;
  /** Calls `listener` on every state change. Returns the unsubscribe function. */
  onStateChange(listener: (state: AudioState) => void): () => void;

  /** Call synchronously in a click or keydown handler, before any `await`. Idempotent. */
  unlock(): void;
  /** The host app registers the platform token files. Replaces (and unloads) an earlier token bank. */
  setTokens(bank: SoundBank<SoundToken>): void;
  /** Fetches and decodes a bank's files in parallel. Never rejects; a file that fails stays silent. */
  load(bank: SoundBank<string>): Promise<void>;
  /** Stops that bank's sounds and frees its buffers. */
  unload(bank: SoundBank<string>): void;

  /**
   * Plays a token or a sound ref now. Dropped, never queued, before unlock or before its file is
   * decoded. Tokens `your-turn`, `celebrate` and `foul`, and refs marked `duck`, duck the music
   * for their length.
   */
  play(sound: SoundToken | SoundRef, options?: { gain?: number }): SoundHandle;
  /**
   * Crossfades to `track` (800 ms by default), looping it from its beginning. The same track does
   * nothing. A track still loading starts once it decodes, if it is still the one asked for.
   * `null` fades to silence.
   */
  music(track: SoundRef | null, options?: { fadeMs?: number }): void;
  /** Ducks the music (to 50% by default) until the returned release, or for `holdMs`. */
  duck(options?: { holdMs?: number; level?: number }): () => void;
  setVolumes(volumes: Volumes): void;
}

export interface AudioOptions {
  /** Creates the page's one `AudioContext`, inside `unlock()`. `null` means no Web Audio. */
  createContext?: (() => AudioContextLike) | null;
  /** Defaults to the browser's `fetch`. */
  fetch?: FetchLike;
  /** Dev warnings. Defaults to `console.warn` in development and nothing in production. */
  warn?: (message: string) => void;
  /** Runs `callback` after `ms`. Returns the cancel function. Defaults to `setTimeout`. */
  setTimer?: (callback: () => void, ms: number) => () => void;
}

/** Timings and limits from docs/architecture/audio.md. */
export const audioLimits = {
  duckLevel: 0.5,
  duckDownMs: 50,
  duckUpMs: 300,
  /** A duck held longer than this releases on its own. */
  duckMaxMs: 10_000,
  crossfadeMs: 800,
  volumeRampMs: 30,
  maxEffectVoices: 16,
  /** The same sound started twice within this plays once. */
  repeatMs: 30,
} as const;

/** Owner decision 1: lobby music on, music at 60%, effects at 80%. */
export const defaultVolumes: Readonly<Volumes> = { muted: false, music: 6, effects: 8 };

/** The gain for a volume step from 0 to 10: `(step / 10) ** 2`, so each step sounds as big. */
export function stepGain(step: number): number {
  return (Math.min(10, Math.max(0, step)) / 10) ** 2;
}

interface Graph {
  ctx: AudioContextLike;
  master: GainNodeLike;
  effects: GainNodeLike;
  duck: GainNodeLike;
  music: GainNodeLike;
}

interface Voice {
  ref: SoundRef;
  source: BufferSourceLike;
  gain: GainNodeLike;
  startedAt: number;
  handle: SoundHandle;
  releaseDuck: (() => void) | null;
}

interface Track {
  ref: SoundRef;
  source: BufferSourceLike;
  fadeOut: GainNodeLike;
}

type DecodeOutcome = "decoded" | "failed" | "skipped";

const silentHandle: SoundHandle = Object.freeze({ stop() {} });
const noop = () => {};
const CURVE_POINTS = 64;

function defaultCreateContext(): (() => AudioContextLike) | null {
  const Context = (globalThis as { AudioContext?: typeof AudioContext }).AudioContext;
  return typeof Context === "function" ? () => new Context({ latencyHint: "interactive" }) : null;
}

function defaultSetTimer(callback: () => void, ms: number): () => void {
  const handle = globalThis.setTimeout(callback, ms);
  return () => globalThis.clearTimeout(handle);
}

function defaultWarn(message: string): void {
  if (import.meta.env.DEV) console.warn(message);
}

/** An equal-power fade from 0 to `level` (`in`) or from 1 to 0 (`out`). */
function equalPowerCurve(direction: "in" | "out", level = 1): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(CURVE_POINTS);
  for (let i = 0; i < CURVE_POINTS; i++) {
    const angle = (i / (CURVE_POINTS - 1)) * (Math.PI / 2);
    curve[i] = direction === "in" ? Math.sin(angle) * level : Math.cos(angle);
  }
  return curve;
}

/** A linear ramp from the current value, replacing any ramp still scheduled. */
function rampTo(ctx: AudioContextLike, param: AudioParamLike, value: number, ms: number): void {
  const now = ctx.currentTime;
  param.cancelScheduledValues(now);
  param.setValueAtTime(param.value, now);
  param.linearRampToValueAtTime(value, now + ms / 1000);
}

function loopStartS(ref: SoundRef): number {
  return typeof ref.def.loop === "object" ? ref.def.loop.startS : 0;
}

function setLoop(source: BufferSourceLike, ref: SoundRef, loop: boolean): void {
  source.loop = loop;
  if (loop && typeof ref.def.loop === "object") {
    source.loopStart = ref.def.loop.startS;
    source.loopEnd = ref.def.loop.endS;
  }
}

function safely(action: () => void): void {
  try {
    action();
  } catch {
    // A node that already stopped, or a context that closed. Sound never throws into game code.
  }
}

export function createAudio(options: AudioOptions = {}): Audio {
  const createContext =
    options.createContext === undefined ? defaultCreateContext() : options.createContext;
  const fetchFile: FetchLike = options.fetch ?? ((url) => globalThis.fetch(url));
  const warn = options.warn ?? defaultWarn;
  const setTimer = options.setTimer ?? defaultSetTimer;

  let state: AudioState = createContext ? "locked" : "unsupported";
  const listeners = new Set<(state: AudioState) => void>();
  let graph: Graph | null = null;

  let volumes: Volumes = { ...defaultVolumes };
  const ducks = new Set<{ level: number }>();
  let duckTarget = 1;

  let tokenBank: SoundBank<SoundToken> | null = null;
  const banks = new Map<SoundBank<string>, { refs: SoundRef[]; loading: Promise<void> }>();
  /** Fetched files waiting for the context, which only exists after `unlock()`. */
  const encoded = new Map<SoundRef, ArrayBuffer>();
  const buffers = new Map<SoundRef, AudioBufferLike>();

  const voices = new Set<Voice>();
  let track: Track | null = null;
  /** The track `music` last asked for: playing, or waiting for its file. */
  let wanted: SoundRef | null = null;
  let wantedFadeMs: number = audioLimits.crossfadeMs;

  function setState(next: AudioState): void {
    if (next === state) return;
    state = next;
    for (const listener of listeners) safely(() => listener(next));
  }

  function syncState(): void {
    if (graph) setState(graph.ctx.state === "running" ? "running" : "locked");
  }

  function buildGraph(ctx: AudioContextLike): Graph {
    const gain = (value: number) => {
      const node = ctx.createGain();
      node.gain.value = value;
      return node;
    };
    const built: Graph = {
      ctx,
      master: gain(volumes.muted ? 0 : 1),
      effects: gain(stepGain(volumes.effects)),
      duck: gain(duckTarget),
      music: gain(stepGain(volumes.music)),
    };
    built.master.connect(ctx.destination);
    built.effects.connect(built.master);
    built.duck.connect(built.music);
    built.music.connect(built.master);
    return built;
  }

  // Loading ------------------------------------------------------------------------------------

  async function decode(bank: SoundBank<string>, ref: SoundRef): Promise<DecodeOutcome> {
    const data = encoded.get(ref);
    if (!graph || !data) return "skipped";
    encoded.delete(ref);
    try {
      const buffer = await graph.ctx.decodeAudioData(data);
      if (!banks.has(bank)) return "skipped";
      buffers.set(ref, buffer);
      if (wanted === ref && track?.ref !== ref) startTrack(ref, wantedFadeMs);
      return "decoded";
    } catch {
      return "failed";
    }
  }

  async function fetchAndDecode(bank: SoundBank<string>, ref: SoundRef): Promise<DecodeOutcome> {
    try {
      const response = await fetchFile(ref.def.src);
      if (!response.ok) throw new Error("not ok");
      const data = await response.arrayBuffer();
      if (!banks.has(bank)) return "skipped";
      encoded.set(ref, data);
    } catch {
      if (banks.has(bank)) warn(`[audio] could not fetch ${ref.def.src}`);
      return "skipped";
    }
    return decode(bank, ref);
  }

  /**
   * One warning per file that doesn't decode, or one for the bank when none do: a browser that
   * can't decode Ogg Vorbis (Safari before 18.4) plays the night without sound.
   */
  async function decodeAll(
    bank: SoundBank<string>,
    refs: SoundRef[],
    run: (ref: SoundRef) => Promise<DecodeOutcome>,
  ): Promise<void> {
    const outcomes = await Promise.all(refs.map(run));
    const failed = refs.filter((_, i) => outcomes[i] === "failed");
    const attempted = outcomes.filter((outcome) => outcome !== "skipped").length;
    if (failed.length > 1 && failed.length === attempted) {
      warn(`[audio] no ${bank.owner} sound decoded; this browser may not play Ogg Vorbis`);
    } else {
      for (const ref of failed) warn(`[audio] could not decode ${ref.def.src}`);
    }
  }

  function load(bank: SoundBank<string>): Promise<void> {
    if (state === "unsupported") return Promise.resolve();
    const known = banks.get(bank);
    if (known) return known.loading;
    const refs = Object.values<SoundRef>(bank.refs);
    const entry = { refs, loading: Promise.resolve() };
    banks.set(bank, entry);
    entry.loading = decodeAll(bank, refs, (ref) => fetchAndDecode(bank, ref));
    return entry.loading;
  }

  function unload(bank: SoundBank<string>): void {
    const entry = banks.get(bank);
    if (!entry) return;
    banks.delete(bank);
    const refs = new Set(entry.refs);
    for (const voice of voices) if (refs.has(voice.ref)) voice.handle.stop();
    if (track && refs.has(track.ref)) fadeOutTrack(0);
    if (wanted && refs.has(wanted)) wanted = null;
    for (const ref of refs) {
      encoded.delete(ref);
      buffers.delete(ref);
    }
    if (tokenBank === bank) tokenBank = null;
  }

  // Ducking ------------------------------------------------------------------------------------

  function applyDuck(): void {
    let target = 1;
    for (const { level } of ducks) target = Math.min(target, level);
    if (target === duckTarget) return;
    const ms = target < duckTarget ? audioLimits.duckDownMs : audioLimits.duckUpMs;
    duckTarget = target;
    if (graph) rampTo(graph.ctx, graph.duck.gain, target, ms);
  }

  function duck({
    holdMs,
    level = audioLimits.duckLevel,
  }: { holdMs?: number; level?: number } = {}) {
    if (state === "unsupported") return noop;
    const entry = { level: Math.min(1, Math.max(0, level)) };
    ducks.add(entry);
    applyDuck();
    const cancelHold = holdMs === undefined ? noop : setTimer(() => release(), holdMs);
    const cancelLimit = setTimer(() => {
      warn(`[audio] a duck lasted over ${audioLimits.duckMaxMs / 1000} s and was released`);
      release();
    }, audioLimits.duckMaxMs);
    function release(): void {
      if (!ducks.delete(entry)) return;
      cancelHold();
      cancelLimit();
      applyDuck();
    }
    return release;
  }

  // Effects ------------------------------------------------------------------------------------

  function tokenOf(ref: SoundRef): SoundToken | null {
    const id = ref.id as SoundToken;
    return tokenBank?.refs[id] === ref ? id : null;
  }

  function play(
    sound: SoundToken | SoundRef,
    { gain: playGain = 1 }: { gain?: number } = {},
  ): SoundHandle {
    const ref = typeof sound === "string" ? tokenBank?.refs[sound] : sound;
    const buffer = ref && buffers.get(ref);
    if (!graph || state !== "running" || !ref || !buffer) return silentHandle;
    const { ctx } = graph;
    const now = ctx.currentTime;
    let effectVoices = 0;
    for (const voice of voices) {
      if (voice.ref === ref && now - voice.startedAt < audioLimits.repeatMs / 1000) {
        return voice.handle;
      }
      if (voice.ref.def.bus === "effects") effectVoices++;
    }
    const onEffects = ref.def.bus === "effects";
    if (onEffects && effectVoices >= audioLimits.maxEffectVoices) return silentHandle;

    try {
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      setLoop(source, ref, ref.def.loop !== undefined);
      const gain = ctx.createGain();
      gain.gain.value = (ref.def.gain ?? 1) * playGain;
      source.connect(gain);
      gain.connect(onEffects ? graph.effects : graph.duck);

      const token = tokenOf(ref);
      const stinger = token ? duckingTokens.includes(token) : onEffects && ref.def.duck === true;
      const voice: Voice = {
        ref,
        source,
        gain,
        startedAt: now,
        releaseDuck: stinger ? duck() : null,
        handle: {
          stop(fadeMs = 0) {
            if (!voices.has(voice) || !graph) return;
            if (fadeMs > 0) rampTo(graph.ctx, gain.gain, 0, fadeMs);
            safely(() => source.stop(graph ? graph.ctx.currentTime + fadeMs / 1000 : 0));
          },
        },
      };
      source.addEventListener("ended", () => {
        voices.delete(voice);
        voice.releaseDuck?.();
        safely(() => source.disconnect());
        safely(() => gain.disconnect());
      });
      voices.add(voice);
      source.start(now, loopStartS(ref));
      return voice.handle;
    } catch {
      return silentHandle;
    }
  }

  // Music --------------------------------------------------------------------------------------

  function fadeOutTrack(fadeMs: number): void {
    if (!track || !graph) return;
    const { source, fadeOut } = track;
    const now = graph.ctx.currentTime;
    track = null;
    safely(() => {
      if (fadeMs > 0) fadeOut.gain.setValueCurveAtTime(equalPowerCurve("out"), now, fadeMs / 1000);
      source.stop(now + fadeMs / 1000);
    });
  }

  function startTrack(ref: SoundRef, fadeMs: number): void {
    const buffer = buffers.get(ref);
    if (!graph || !buffer) return;
    const { ctx, duck: duckNode } = graph;
    const now = ctx.currentTime;
    fadeOutTrack(fadeMs);
    safely(() => {
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      setLoop(source, ref, true);
      // Two gain nodes, so a fade out that starts before the fade in ends never overlaps a curve.
      const fadeIn = ctx.createGain();
      const fadeOut = ctx.createGain();
      const level = ref.def.gain ?? 1;
      if (fadeMs > 0) {
        fadeIn.gain.value = 0;
        fadeIn.gain.setValueCurveAtTime(equalPowerCurve("in", level), now, fadeMs / 1000);
      } else {
        fadeIn.gain.value = level;
      }
      source.connect(fadeIn);
      fadeIn.connect(fadeOut);
      fadeOut.connect(duckNode);
      source.addEventListener("ended", () => {
        safely(() => source.disconnect());
        safely(() => fadeIn.disconnect());
        safely(() => fadeOut.disconnect());
      });
      source.start(now, loopStartS(ref));
      track = { ref, source, fadeOut };
    });
  }

  function music(next: SoundRef | null, { fadeMs = audioLimits.crossfadeMs } = {}): void {
    if (state === "unsupported") return;
    const fade = Math.max(0, fadeMs);
    if (next === null) {
      wanted = null;
      fadeOutTrack(fade);
      return;
    }
    if (next === wanted) return;
    wanted = next;
    wantedFadeMs = fade;
    if (track?.ref !== next) startTrack(next, fade);
  }

  // Unlock and volume --------------------------------------------------------------------------

  function unlock(): void {
    if (state === "unsupported" || !createContext) return;
    if (!graph) {
      let ctx: AudioContextLike;
      try {
        ctx = createContext();
        graph = buildGraph(ctx);
      } catch {
        graph = null;
        setState("unsupported");
        return;
      }
      ctx.addEventListener("statechange", syncState);
      for (const [bank, { refs }] of banks) {
        const waiting = refs.filter((ref) => encoded.has(ref));
        if (waiting.length > 0) void decodeAll(bank, waiting, (ref) => decode(bank, ref));
      }
    }
    const { ctx } = graph;
    if (ctx.state !== "running") {
      safely(() => {
        void ctx.resume().then(syncState, noop);
      });
      // Starting a one-sample silent buffer inside the gesture is an old WebKit unlock workaround.
      safely(() => {
        const source = ctx.createBufferSource();
        source.buffer = ctx.createBuffer(1, 1, 22_050);
        source.connect(ctx.destination);
        source.start(0);
      });
    }
    syncState();
  }

  function setVolumes(next: Volumes): void {
    volumes = { ...next };
    if (!graph) return;
    const { ctx } = graph;
    const ms = audioLimits.volumeRampMs;
    rampTo(ctx, graph.master.gain, volumes.muted ? 0 : 1, ms);
    rampTo(ctx, graph.effects.gain, stepGain(volumes.effects), ms);
    rampTo(ctx, graph.music.gain, stepGain(volumes.music), ms);
  }

  return {
    get state() {
      return state;
    },
    onStateChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    unlock,
    setTokens(bank) {
      if (tokenBank && tokenBank !== bank) unload(tokenBank);
      tokenBank = bank;
      void load(bank);
    },
    load,
    unload,
    play,
    music,
    duck,
    setVolumes,
  };
}
