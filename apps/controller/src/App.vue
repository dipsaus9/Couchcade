<script setup lang="ts">
import { computed, onBeforeUnmount, watch } from "vue";
import RotateNotice from "./components/RotateNotice.vue";
import { motionAdapter } from "./motion/adapter.ts";
import MotionResume from "./motion/MotionResume.vue";
import MotionStepScreen from "./motion/MotionStepScreen.vue";
import { enterMotionFullscreen, exitMotionFullscreen, phonePlatform } from "./motion/platform.ts";
import { createMotionSession } from "./motion/session.ts";
import GameController from "./runtime/GameController.vue";
import { showsGameController } from "./runtime/controller.ts";
import { exposeLinkTestHook } from "./runtime/link-test-hook.ts";
import { parseAudienceView } from "./screens/audience/audience-view.ts";
import AudienceScreen from "./screens/audience/AudienceScreen.vue";
import { parseCalibrationView } from "./screens/calibration/calibration-view.ts";
import CalibrationScreen from "./screens/calibration/CalibrationScreen.vue";
import JoinScreen from "./screens/join/JoinScreen.vue";
import { kickedFrom } from "./screens/kicked/kicked.ts";
import KickedScreen from "./screens/kicked/KickedScreen.vue";
import LobbyScreen from "./screens/lobby/LobbyScreen.vue";
import { isVipLobby, parseMenuView } from "./screens/menu/menu-view.ts";
import MenuScreen from "./screens/menu/MenuScreen.vue";
import { parseResultsView } from "./screens/results/results-view.ts";
import ResultsScreen from "./screens/results/ResultsScreen.vue";
import { showsRoomFull } from "./screens/room-full/room-full.ts";
import RoomFullScreen from "./screens/room-full/RoomFullScreen.vue";
import { waitingCopy } from "./screens/waiting/copy.ts";
import WaitingScreen from "./screens/waiting/WaitingScreen.vue";
import { createTurnstile } from "./security/turnstile.ts";
import { createPhoneSession } from "./session/session.ts";
import { screenOf } from "./session/state.ts";

const session = createPhoneSession({ turnstile: createTurnstile({ action: "join" }) });
// The link's E2E test hook (docs/architecture/realtime-link.md, "Testing"): production builds
// never read or set the global, since the call site sits behind `import.meta.env.DEV`.
if (import.meta.env.DEV) exposeLinkTestHook(session.link);
const state = session.state;
const screen = computed(() => screenOf(state.value));
const kicked = computed(() => kickedFrom(state.value));
const roomFull = computed(() => showsRoomFull(state.value));
const menuView = computed(() =>
  state.value.status === "room" && state.value.view !== null && screen.value === "menu"
    ? parseMenuView(state.value.view.data)
    : null,
);
const resultsView = computed(() =>
  state.value.status === "room" && state.value.view !== null && screen.value === "results"
    ? parseResultsView(state.value.view.data)
    : null,
);
const calibrationView = computed(() =>
  state.value.status === "room" && state.value.view !== null && screen.value === "calibration"
    ? parseCalibrationView(state.value.view.data)
    : null,
);

// The motion step before a motion game, and "Tap to resume" during one (motion.md, "Permission,
// calibration and resume flow"). The adapter is created at start, so an E2E test's fake is there
// before the first tap.
const platform = phonePlatform();
const motion = createMotionSession({
  adapter: motionAdapter,
  send: session.send,
  keepAwake: session.keepAwake,
  enterFullscreen: () => enterMotionFullscreen(platform),
  exitFullscreen: () => exitMotionFullscreen(),
  needsGyroscope: true,
});
motionAdapter();
watch(state, (next) => motion.follow(next), { immediate: true });
const motionGame = motion.state;
const motionStep = computed(() => (screen.value === "motion-permission" ? motionGame.value : null));
const resuming = computed(() => {
  const game = motionGame.value;
  return (
    game !== null && game.paused && (motionStep.value !== null || showsGameController(state.value))
  );
});
// CC-5.13: a reload lost the calibration too, not just the sensors, so "Tap to resume" says so.
const resumeReason = computed(() => (motionGame.value?.calibration === null ? "reload" : "sleep"));

onBeforeUnmount(() => {
  motion.dispose();
  session.dispose();
});
</script>

<template>
  <main class="app">
    <KickedScreen v-if="kicked !== null" :code="kicked" @leave="session.dismissNotice" />
    <RoomFullScreen v-else-if="roomFull" @leave="session.dismissNotice" />
    <JoinScreen
      v-else-if="state.status === 'join'"
      :draft="state.draft"
      :submitting="state.submitting"
      :notice="state.notice"
      @join="session.join"
    />
    <LobbyScreen
      v-else-if="state.status === 'room' && screen === 'lobby'"
      :you="state.you"
      :role="state.role"
      :code="state.session.code"
      :host-connected="state.hostConnected"
      :online="state.online"
      :vip="isVipLobby(state.view)"
      @send="session.send"
    />
    <AudienceScreen
      v-else-if="state.status === 'room' && screen === 'audience'"
      :name="state.you.name"
      :view="parseAudienceView(state.view)"
    />
    <MenuScreen v-else-if="menuView" :view="menuView" @send="session.send" />
    <ResultsScreen v-else-if="resultsView" :view="resultsView" @send="session.send" />
    <CalibrationScreen v-else-if="calibrationView" :view="calibrationView" @send="session.send" />
    <MotionStepScreen
      v-else-if="motionStep"
      :game="motionStep"
      :platform="platform"
      @enable="motion.enable"
      @use-touch="motion.useTouch"
      @acknowledge="motion.acknowledge"
    />
    <GameController
      v-else-if="showsGameController(state)"
      :state="state"
      :send-message="session.send"
      :motion="motionGame"
      :link="session.link"
    />
    <WaitingScreen v-else v-bind="waitingCopy(state)" />
  </main>
  <MotionResume
    v-if="resuming && state.status === 'room'"
    :name="state.you.name"
    :reason="resumeReason"
    @resume="motion.resume"
  />
  <!-- Motion works whichever way the page turns, so a motion game never shows the rotate panel. -->
  <RotateNotice v-if="motionGame === null" />
</template>

<style>
:root {
  color-scheme: light;
  -webkit-text-size-adjust: 100%;
}

body {
  margin: 0;
  color: var(--cc-ink);
  background: var(--cc-sky);
  font-family: var(--cc-font-ui);
  font-size: var(--cc-text-body-phone);
  font-weight: var(--cc-text-body-weight);
  line-height: 1.35;
}

.app {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
  max-width: 30rem;
  margin-inline: auto;
  padding: max(var(--cc-space-4), env(safe-area-inset-top)) var(--cc-space-4)
    max(var(--cc-space-6), env(safe-area-inset-bottom));
}
</style>
