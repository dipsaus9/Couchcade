<script setup lang="ts">
import { audio } from "@couchcade/audio";
import { roomClock } from "@couchcade/game-sdk/clock";
import { CcButton } from "@couchcade/ui";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { watchButtonPresses } from "./audio/button-press.ts";
import { isClickForSoundVisible } from "./audio/click-for-sound.ts";
import { applyHostSettings } from "./audio/host-settings.ts";
import { applyPhaseMusic } from "./audio/phase-music.ts";
import { applyPhaseScene } from "./audio/phase-scene.ts";
import { registerPlatformSounds } from "./audio/platform-sounds.ts";
import { watchForUnlock } from "./audio/unlock.ts";
import { watchConnectionDelay } from "./errors/connection-delay.ts";
import ConnectionBadge from "./errors/ConnectionBadge.vue";
import { connectionLostCopy, offlineCopy } from "./errors/copy.ts";
import { watchNetwork } from "./errors/network.ts";
import OfflineScreen from "./errors/OfflineScreen.vue";
import QuotaScreen from "./errors/QuotaScreen.vue";
import MotionStepScreen from "./motion/MotionStepScreen.vue";
import { localNow } from "./runtime/timing.ts";
import CalibrationScreen from "./screens/calibration/CalibrationScreen.vue";
import LobbyScreen from "./screens/lobby/LobbyScreen.vue";
import MenuScreen from "./screens/menu/MenuScreen.vue";
import PasscodeScreen from "./screens/passcode/PasscodeScreen.vue";
import ResultsScreen from "./screens/results/ResultsScreen.vue";
import { useHostSession } from "./session/use-host-session.ts";
import { watchMuteHotkey } from "./settings/mute-hotkey.ts";

const { screen, openRoom, endRoom, calibration, moderate, endGameEarly, quotaReached } =
  useHostSession();

// "This TV is offline" (errors/OfflineScreen.vue): the browser's own online/offline signal,
// app-wide, over whatever screen was showing. Full takeover everywhere except "playing" -- the
// host stays authoritative and a running game never pauses for connectivity
// (docs/architecture/session-flow.md, "On the host"), so it gets the small chip instead, the same
// as a dropped relay below.
const network = watchNetwork((next) => {
  offline.value = next;
});
const offline = ref(network.isOffline());
onBeforeUnmount(network.dispose);
const showsOfflineScreen = computed(() => offline.value && screen.value.name !== "playing");

// The "Connection lost" chip (errors/ConnectionBadge.vue): shown once the relay socket has been
// away for a beat, on every phase that tracks a connection except the lobby (its own inline
// "Reconnecting..." text already says so). While offline, the offline screen or chip already says
// so, so this stays quiet rather than stacking a second, less specific message.
const connectionLostTooLong = ref(false);
const connectionDelay = watchConnectionDelay(() => {
  connectionLostTooLong.value = true;
});
watch(
  () => ("connection" in screen.value ? screen.value.connection : "open"),
  (status) => {
    if (status === "open") {
      connectionDelay.restored();
      connectionLostTooLong.value = false;
    } else {
      connectionDelay.lost();
    }
  },
  { immediate: true },
);
onBeforeUnmount(connectionDelay.dispose);

/** The small chip's text: "This TV is offline" during "playing", "Reconnecting..." otherwise. */
const connectionBadgeText = computed(() =>
  screen.value.name === "playing" ? offlineCopy.title : connectionLostCopy,
);
const showsConnectionBadge = computed(() => {
  if (screen.value.name === "playing") return offline.value || connectionLostTooLong.value;
  return !offline.value && connectionLostTooLong.value && screen.value.name !== "lobby";
});
const origin = window.location.origin;
const roomNow = () => roomClock.toHostTime(localNow());
const toRoomTime = (localTimestamp: number) => roomClock.toHostTime(localTimestamp);

// Screens are laid out on a 1920×1080 TV frame, like the design canvas, and scaled to the window.
const frameWidth = 1920;
const frameHeight = 1080;
const scale = ref(1);
const fit = () => {
  scale.value = Math.min(window.innerWidth / frameWidth, window.innerHeight / frameHeight);
};
fit();
window.addEventListener("resize", fit);
onBeforeUnmount(() => window.removeEventListener("resize", fit));

// Sound (docs/architecture/audio.md). Applies the laptop's stored volumes (CC-7.6 builds the
// settings that write them), registers and starts fetching the platform's own sounds, and opens
// the autoplay lock on any click or key press while it's still shut -- the passcode submit also
// opens it directly (PasscodeScreen.vue), since a refreshed TV skips that screen entirely.
applyHostSettings();
registerPlatformSounds();
const stopWatchingForUnlock = watchForUnlock();
onBeforeUnmount(stopWatchingForUnlock);

// `press` on every laptop button click (CC-7.7, audio.md's token table).
const stopWatchingButtonPresses = watchButtonPresses();
onBeforeUnmount(stopWatchingButtonPresses);

// The `M` key (CC-7.6, audio.md "Host settings" rule 3): toggles mute on any TV screen, except
// while a text field has focus.
const stopWatchingMuteHotkey = watchMuteHotkey();
onBeforeUnmount(stopWatchingMuteHotkey);

// The music for the phase the TV is showing. `screen.name` already models `playing` (the frame
// stays empty then), so this covers every phase without reading the runtime's `HostPhase` too.
watch(() => screen.value.name, applyPhaseMusic);

// The `scene` whoosh on every phase change (CC-7.7, audio.md's token table).
watch(() => screen.value.name, applyPhaseScene);

// The "Click for sound" chip: shown while the autoplay lock is still shut (owner decision 4), and
// again if it falls back to locked (Safari suspending on an interruption).
const audioLocked = ref(isClickForSoundVisible(audio.state));
const stopWatchingAudioState = audio.onStateChange((state) => {
  audioLocked.value = isClickForSoundVisible(state);
});
onBeforeUnmount(stopWatchingAudioState);
</script>

<template>
  <div
    class="frame"
    :style="{
      width: `${frameWidth}px`,
      height: `${frameHeight}px`,
      transform: `translate(-50%, -50%) scale(${scale})`,
    }"
  >
    <OfflineScreen v-if="showsOfflineScreen" />
    <LobbyScreen
      v-else-if="screen.name === 'lobby'"
      :lobby="screen.lobby"
      :connection="screen.connection"
      :origin="origin"
      :display-lag="screen.displayLag"
      @end="endRoom"
      @check-tv-lag="calibration.start"
      @kick="moderate.kick"
      @lock="moderate.lock"
    />
    <CalibrationScreen
      v-else-if="screen.name === 'calibration'"
      :lobby="screen.lobby"
      :calibration="screen.calibration"
      :to-room-time="toRoomTime"
      :frame="calibration.frame"
      @skip="calibration.skip"
      @retry="calibration.retry"
    />
    <MenuScreen
      v-else-if="screen.name === 'menu'"
      :lobby="screen.lobby"
      :menu="screen.menu"
      :room-now="roomNow"
    />
    <MotionStepScreen
      v-else-if="screen.name === 'motion'"
      :lobby="screen.lobby"
      :motion="screen.motion"
    />
    <ResultsScreen
      v-else-if="screen.name === 'results'"
      :lobby="screen.lobby"
      :results="screen.results"
    />
    <QuotaScreen v-else-if="screen.name === 'passcode' && quotaReached" />
    <PasscodeScreen
      v-else-if="screen.name === 'passcode'"
      :notice="screen.notice"
      :open-room="openRoom"
    />
    <!-- While a game runs the frame stays empty, so the stage under it shows the game's scene. -->
    <!-- CC-3.27: the host's own "End game" escape hatch, so a running game doesn't have to run to
         completion. Always allowed: no guard needed for the host's own screen. -->
    <div v-if="screen.name === 'playing'" class="playing-controls">
      <CcButton screen="tv" variant="stop" small @press="endGameEarly">End game</CcButton>
    </div>

    <!-- audio.md owner decision 4: a refreshed TV has had no click or key press yet. -->
    <p v-if="audioLocked" class="sound-chip">Click for sound</p>
    <ConnectionBadge v-if="showsConnectionBadge" :text="connectionBadgeText" />
  </div>
</template>

<style scoped>
.frame {
  position: absolute;
  top: 50%;
  left: 50%;
  box-sizing: border-box;
  /* safe-tv: 96px left and right, 54px top and bottom at 1080p. */
  padding: 54px 96px;
}

.playing-controls {
  /* .frame's own padding is the safe-tv margin; absolute children sit outside it, so this repeats
     those two values to land inside the safe area instead. */
  position: absolute;
  top: 54px;
  right: 96px;
}

.sound-chip {
  /* .frame's own padding is the safe-tv margin; absolute children sit outside it, so this repeats
     those two values to land inside the safe area instead. */
  position: absolute;
  left: 96px;
  bottom: 54px;
  margin: 0;
  padding: var(--cc-space-2) var(--cc-space-4);
  font: 700 var(--cc-text-small-tv) var(--cc-text-small-font);
  color: var(--cc-ink);
  background: var(--cc-chalk);
  border: var(--cc-outline-tv) solid var(--cc-ink);
  border-radius: var(--cc-radius-pill);
  box-shadow: var(--cc-depth-panel);
}
</style>

<style>
/* Base styles for the TV. Every value comes from the theme's CSS variables (see main.ts). */
html,
body {
  height: 100%;
  margin: 0;
  overflow: hidden;
}

body {
  color: var(--cc-ink);
  background: var(--cc-sky);
  font: var(--cc-text-body-weight) var(--cc-text-body-tv) var(--cc-font-ui);
}

#stage,
#app {
  position: fixed;
  inset: 0;
}

/* The Phaser canvas sits under the interface, letterboxed in Sky. */
#stage {
  background: var(--cc-sky);
}

#stage canvas {
  image-rendering: pixelated;
}
</style>
