<script setup lang="ts">
import { roomClock } from "@couchcade/game-sdk/clock";
import { onBeforeUnmount, ref } from "vue";
import { localNow } from "./runtime/timing.ts";
import CalibrationScreen from "./screens/calibration/CalibrationScreen.vue";
import LobbyScreen from "./screens/lobby/LobbyScreen.vue";
import MenuScreen from "./screens/menu/MenuScreen.vue";
import PasscodeScreen from "./screens/passcode/PasscodeScreen.vue";
import ResultsScreen from "./screens/results/ResultsScreen.vue";
import { useHostSession } from "./session/use-host-session.ts";

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
