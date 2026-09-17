<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref } from "vue";
import {
  defaultExpect,
  detectRawSigns,
  isKebabCase,
  roundVector,
  todayDate,
  TRACE_GESTURES,
  TRACE_PLATFORMS,
  type RecordedTrace,
  type TraceGesture,
  type TraceMark,
  type TracePlatform,
  type TraceSampleRow,
  type TraceVector,
} from "./trace-format.ts";

// Dev-only recorder for pnpm trace:record (docs/architecture/motion.md, "Recording (CC-5.9)").
// Records a labelled sensor trace as JSON for packages/motion/test/traces/ - see that folder's
// README.md for the format and what to record. This page is never part of the production
// controller bundle (its own vite.config.ts, never imported by apps/controller/src/main.ts).

type Status =
  | "idle"
  | "requesting"
  | "denied"
  | "unsupported"
  | "calibrating"
  | "ready"
  | "recording"
  | "review";

/** `DeviceMotionEvent.requestPermission` isn't in the DOM lib types (iOS Safari 13+, Chrome 151+). */
interface MotionPermissionCtor {
  requestPermission?: () => Promise<string>;
}

/** How long to hold still before the gravity sign is measured (motion.md rest calibration default). */
const CALIBRATION_MS = 1000;
/** The unclear `|y + z|` band for the sign decision (motion.md, "Sign conventions"). */
const SIGN_BAND = 2;

function detectPlatform(): TracePlatform {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) ? "ios" : "android";
}

const status = ref<Status>("idle");
const error = ref<string | null>(null);
const saved = ref<string | null>(null);
const saving = ref(false);

const gesture = ref<TraceGesture>("swing");
const label = ref("");
const platform = ref<TracePlatform>(detectPlatform());
const device = ref("");
const rawSigns = ref<"w3c" | "inverted">("w3c");

const live = reactive<{
  interval: number | null;
  acceleration: TraceVector | null;
  gravityAcceleration: TraceVector | null;
  rotationRate: TraceVector | null;
}>({ interval: null, acceleration: null, gravityAcceleration: null, rotationRate: null });

const capability = computed(() => {
  if (live.rotationRate) return "full (gyroscope + accelerometer)";
  if (live.acceleration ?? live.gravityAcceleration) return "accelerometer only";
  return "no data yet";
});

const takeSamples = ref<TraceSampleRow[]>([]);
const takeMarks = ref<TraceMark[]>([]);
const takeDurationMs = computed(() => takeMarks.value.at(-1)?.[0] ?? 0);

let listening = false;
let wakeLock: WakeLockSentinel | undefined;
let calibrationStart: number | null = null;
let calibrationSamples: TraceVector[] = [];
let takeAnchor: number | null = null;

function toVector(
  v: { x: number | null; y: number | null; z: number | null } | null,
): TraceVector | null {
  if (!v) return null;
  const { x, y, z } = v;
  if (x === null || y === null || z === null) return null;
  if (Number.isNaN(x) || Number.isNaN(y) || Number.isNaN(z)) return null;
  return roundVector([x, y, z]);
}

function toRotationRate(
  r: { alpha: number | null; beta: number | null; gamma: number | null } | null,
): TraceVector | null {
  if (!r) return null;
  const { alpha, beta, gamma } = r;
  if (alpha === null || beta === null || gamma === null) return null;
  if (Number.isNaN(alpha) || Number.isNaN(beta) || Number.isNaN(gamma)) return null;
  return roundVector([alpha, beta, gamma]);
}

function finishCalibration(): void {
  if (calibrationSamples.length > 0) {
    let sumY = 0;
    let sumZ = 0;
    for (const [, y, z] of calibrationSamples) {
      sumY += y;
      sumZ += z;
    }
    const meanY = sumY / calibrationSamples.length;
    const meanZ = sumZ / calibrationSamples.length;
    rawSigns.value = detectRawSigns(meanY, meanZ, rawSigns.value, SIGN_BAND);
  }
  status.value = "ready";
}

function onDeviceMotion(event: DeviceMotionEvent): void {
  const acceleration = toVector(event.acceleration);
  const gravityAcceleration = toVector(event.accelerationIncludingGravity);
  const rotationRate = toRotationRate(event.rotationRate);
  const interval = event.interval || 0;

  live.interval = interval;
  live.acceleration = acceleration;
  live.gravityAcceleration = gravityAcceleration;
  live.rotationRate = rotationRate;

  if (status.value === "calibrating") {
    calibrationStart ??= event.timeStamp;
    if (gravityAcceleration) calibrationSamples.push(gravityAcceleration);
    if (event.timeStamp - calibrationStart >= CALIBRATION_MS) finishCalibration();
  }

  if (status.value === "recording" && takeAnchor !== null) {
    const t = Math.round(event.timeStamp - takeAnchor);
    takeSamples.value.push([t, interval, acceleration, gravityAcceleration, rotationRate]);
  }
}

async function enableMotion(): Promise<void> {
  error.value = null;
  saved.value = null;
  status.value = "requesting";

  if (typeof window.DeviceMotionEvent === "undefined" || !window.isSecureContext) {
    status.value = "unsupported";
    return;
  }

  const ctor = window.DeviceMotionEvent as unknown as MotionPermissionCtor;
  if (typeof ctor.requestPermission === "function") {
    // No await before this call: the tap's user gesture must still be active (motion.md adapter rule 1).
    let result: string;
    try {
      result = await ctor.requestPermission();
    } catch {
      status.value = "unsupported";
      return;
    }
    if (result !== "granted") {
      status.value = "denied";
      return;
    }
  }

  window.addEventListener("devicemotion", onDeviceMotion);
  listening = true;
  calibrationStart = null;
  calibrationSamples = [];
  status.value = "calibrating";

  try {
    wakeLock = await navigator.wakeLock?.request("screen");
  } catch {
    // Best effort only (motion.md flow rule 5) - recording still works without it.
  }
}

function startTake(): void {
  if (status.value !== "ready") return;
  takeSamples.value = [];
  takeAnchor = performance.now();
  takeMarks.value = [[0, "grip-down"]];
  status.value = "recording";
}

function endTake(): void {
  if (status.value !== "recording" || takeAnchor === null) return;
  takeMarks.value.push([Math.round(performance.now() - takeAnchor), "grip-up"]);
  takeAnchor = null;
  if (takeSamples.value.length === 0) {
    error.value = "No samples captured - hold the button a little longer.";
    status.value = "ready";
    return;
  }
  status.value = "review";
}

function discardTake(): void {
  takeSamples.value = [];
  takeMarks.value = [];
  status.value = "ready";
}

async function saveTake(): Promise<void> {
  error.value = null;
  if (!isKebabCase(label.value)) {
    error.value =
      "Label must be kebab-case (lowercase letters, digits and hyphens), e.g. bowling-straight-medium.";
    return;
  }

  const trace: RecordedTrace = {
    v: 1,
    gesture: gesture.value,
    label: label.value,
    platform: platform.value,
    device: device.value.trim() || "unknown",
    recordedAt: todayDate(),
    rawSigns: rawSigns.value,
    expect: defaultExpect(gesture.value),
    marks: takeMarks.value,
    samples: takeSamples.value,
  };

  saving.value = true;
  try {
    const response = await fetch("/api/trace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(trace),
    });
    const body = (await response.json()) as { path?: string; error?: string };
    if (!response.ok || body.error) {
      error.value = body.error ?? `Save failed (${String(response.status)})`;
      return;
    }
    saved.value = body.path ?? null;
    takeSamples.value = [];
    takeMarks.value = [];
    status.value = "ready";
  } catch {
    error.value = "Could not reach the recorder's save endpoint. Is the dev server still running?";
  } finally {
    saving.value = false;
  }
}

function formatVec(v: TraceVector | null): string {
  if (!v) return "–";
  return `${v[0].toFixed(2)}, ${v[1].toFixed(2)}, ${v[2].toFixed(2)}`;
}

onBeforeUnmount(() => {
  if (listening) window.removeEventListener("devicemotion", onDeviceMotion);
  wakeLock?.release().catch(() => {
    // Nothing to do - the page is going away.
  });
});
</script>

<template>
  <main>
    <h1>Trace recorder (dev only)</h1>
    <p>
      Records a labelled sensor trace as JSON for
      <code>packages/motion/test/traces/</code>. See that folder's README for the format and what to
      record.
    </p>

    <section
      v-if="
        status === 'idle' ||
        status === 'requesting' ||
        status === 'denied' ||
        status === 'unsupported'
      "
    >
      <button type="button" :disabled="status === 'requesting'" @click="enableMotion">
        Enable motion
      </button>
      <p v-if="status === 'denied'">
        Motion permission was denied. Reload the page and allow it to record a trace.
      </p>
      <p v-if="status === 'unsupported'">
        This browser or page has no motion sensors, or the page isn't a secure context (HTTPS). See
        the README's "Reaching it from a phone" section.
      </p>
    </section>

    <section v-else-if="status === 'calibrating'">
      <p>Hold your phone still for a second…</p>
    </section>

    <section v-else>
      <fieldset :disabled="status === 'recording'">
        <legend>Take</legend>
        <p>
          <label>
            Gesture
            <select v-model="gesture">
              <option v-for="g in TRACE_GESTURES" :key="g" :value="g">{{ g }}</option>
            </select>
          </label>
        </p>
        <p>
          <label>
            Label
            <input v-model="label" type="text" placeholder="bowling-straight-medium" />
          </label>
        </p>
        <p>
          <label>
            Platform
            <select v-model="platform">
              <option v-for="p in TRACE_PLATFORMS" :key="p" :value="p">{{ p }}</option>
            </select>
          </label>
        </p>
        <p>
          <label>
            Device
            <input v-model="device" type="text" placeholder="iPhone 15" />
          </label>
        </p>
      </fieldset>

      <p>
        Saves to
        <code
          >packages/motion/test/traces/{{ gesture }}/{{ platform }}-{{ label || "…" }}.json</code
        >
      </p>

      <dl>
        <dt>Rotation rate (deg/s)</dt>
        <dd>{{ formatVec(live.rotationRate) }}</dd>
        <dt>Acceleration (m/s²)</dt>
        <dd>{{ formatVec(live.acceleration) }}</dd>
        <dt>Gravity + acceleration (m/s²)</dt>
        <dd>{{ formatVec(live.gravityAcceleration) }}</dd>
        <dt>Sample interval</dt>
        <dd>{{ live.interval === null ? "–" : `${live.interval} ms` }}</dd>
        <dt>Sensors</dt>
        <dd>{{ capability }}</dd>
        <dt>Gravity sign</dt>
        <dd>{{ rawSigns }}</dd>
      </dl>

      <button
        v-if="status === 'ready' || status === 'recording'"
        type="button"
        class="grip"
        @pointerdown.prevent="startTake"
        @pointerup.prevent="endTake"
        @pointerleave="endTake"
        @pointercancel="endTake"
      >
        {{ status === "recording" ? "Recording… release to stop" : "Press and hold to record" }}
      </button>

      <section v-if="status === 'review'">
        <p>{{ takeSamples.length }} samples, {{ takeDurationMs }} ms.</p>
        <button type="button" :disabled="saving" @click="saveTake">Save</button>
        <button type="button" :disabled="saving" @click="discardTake">Discard</button>
      </section>

      <p v-if="saved">Saved to {{ saved }}</p>
      <p v-if="error" role="alert">{{ error }}</p>
    </section>
  </main>
</template>

<style scoped>
main {
  box-sizing: border-box;
  max-width: 32rem;
  margin: 0 auto;
  padding: 1rem;
}

.grip {
  box-sizing: border-box;
  width: 100%;
  min-height: 4rem;
  touch-action: none;
  user-select: none;
}

dl {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 0.25rem 1rem;
}

dd {
  margin: 0;
}
</style>
