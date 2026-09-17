<script setup lang="ts">
import { audio } from "@couchcade/audio";
import { roomClock } from "@couchcade/game-sdk/clock";
import { onBeforeUnmount, ref, watch } from "vue";
import { isClickForSoundVisible } from "./audio/click-for-sound.ts";
import { applyHostSettings } from "./audio/host-settings.ts";
import { applyPhaseMusic } from "./audio/phase-music.ts";
import { registerPlatformSounds } from "./audio/platform-sounds.ts";
import { watchForUnlock } from "./audio/unlock.ts";
import MotionStepScreen from "./motion/MotionStepScreen.vue";
import { localNow } from "./runtime/timing.ts";
import CalibrationScreen from "./screens/calibration/CalibrationScreen.vue";
import LobbyScreen from "./screens/lobby/LobbyScreen.vue";
import MenuScreen from "./screens/menu/MenuScreen.vue";
import PasscodeScreen from "./screens/passcode/PasscodeScreen.vue";
import ResultsScreen from "./screens/results/ResultsScreen.vue";
import { useHostSession } from "./session/use-host-session.ts";
import { watchMuteHotkey } from "./settings/mute-hotkey.ts";

const { screen, openRoom, endRoom, calibration, moderate } = useHostSession();
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

// The `M` key (CC-7.6, audio.md "Host settings" rule 3): toggles mute on any TV screen, except
// while a text field has focus.
const stopWatchingMuteHotkey = watchMuteHotkey();
onBeforeUnmount(stopWatchingMuteHotkey);

// The music for the phase the TV is showing. `screen.name` already models `playing` (the frame
// stays empty then), so this covers every phase without reading the runtime's `HostPhase` too.
watch(() => screen.value.name, applyPhaseMusic);

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
    <LobbyScreen
      v-if="screen.name === 'lobby'"
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
    <PasscodeScreen
      v-else-if="screen.name === 'passcode'"
      :notice="screen.notice"
      :open-room="openRoom"
    />
    <!-- While a game runs the frame stays empty, so the stage under it shows the game's scene. -->

    <!-- audio.md owner decision 4: a refreshed TV has had no click or key press yet. -->
    <p v-if="audioLocked" class="sound-chip">Click for sound</p>
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
