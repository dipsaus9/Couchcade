/**
 * The small part of the Web Audio API the engine uses. The browser's `AudioContext` fits these
 * types, and so does the fake the unit tests pass to `createAudio`.
 */

export interface AudioParamLike {
  value: number;
  setValueAtTime(value: number, startTime: number): unknown;
  linearRampToValueAtTime(value: number, endTime: number): unknown;
  setValueCurveAtTime(
    values: Float32Array<ArrayBuffer>,
    startTime: number,
    duration: number,
  ): unknown;
  cancelScheduledValues(cancelTime: number): unknown;
}

export interface AudioNodeLike {
  connect(destination: AudioNodeLike): unknown;
  disconnect(): void;
}

export interface GainNodeLike extends AudioNodeLike {
  readonly gain: AudioParamLike;
}

export interface AudioBufferLike {
  readonly duration: number;
}

export interface BufferSourceLike extends AudioNodeLike {
  buffer: AudioBufferLike | null;
  loop: boolean;
  loopStart: number;
  loopEnd: number;
  addEventListener(type: "ended", listener: () => void): void;
  start(when?: number, offset?: number): void;
  stop(when?: number): void;
}

export interface AudioContextLike {
  /** "running", "suspended", "closed", or Safari's "interrupted". */
  readonly state: string;
  readonly currentTime: number;
  readonly destination: AudioNodeLike;
  addEventListener(type: "statechange", listener: () => void): void;
  createGain(): GainNodeLike;
  createBufferSource(): BufferSourceLike;
  createBuffer(channels: number, length: number, sampleRate: number): AudioBufferLike;
  decodeAudioData(data: ArrayBuffer): Promise<AudioBufferLike>;
  resume(): Promise<void>;
}

/** Fetches a sound file. The browser's `fetch` fits. */
export type FetchLike = (
  url: string,
) => Promise<{ ok: boolean; arrayBuffer(): Promise<ArrayBuffer> }>;
