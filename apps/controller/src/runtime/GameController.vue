<script setup lang="ts">
import type { GameInput } from "@couchcade/game-sdk/contract";
import type { PhoneToRelayMessage } from "@couchcade/protocol";
import { CcButton } from "@couchcade/ui";
import { computed, onBeforeUnmount, onMounted, watch } from "vue";
import { motionAdapter } from "../motion/adapter.ts";
import type { MotionGame } from "../motion/session.ts";
import WaitingScreen from "../screens/waiting/WaitingScreen.vue";
import { isVipInGame } from "../session/state.ts";
import { loadingControllerCopy, missingGameCopy } from "./copy.ts";
import {
  controllerMotion,
  controllerProps,
  useGameController,
  type GameState,
} from "./controller.ts";
import { controllers } from "./games.ts";
import type { ControllerLink } from "./link.ts";
import { createInputSender, endGameAction } from "./send.ts";

// The running game's controller (docs/architecture/platform.md, "How the phone shows a
// controller"): its phone entry loads by game id and gets the latest view as props, plus the motion
// step's result for a motion game and its real-time input channel over the link.

const props = defineProps<{
  state: GameState;
  sendMessage: (message: PhoneToRelayMessage) => void;
  /** The motion session's game, null outside a motion game. */
  motion: MotionGame | null;
  /** The phone's WebRTC link runtime (session/session.ts), shared across every running game. */
  link: ControllerLink;
}>();

const send = createInputSender({
  sendMessage: (message) => props.sendMessage(message),
  canSend: () => props.state.role === "player" && props.state.online,
});

/**
 * "End game" (CC-3.27, gated to the VIP by CC-3.28): the host still ignores anyone else's tap
 * (apps/host/src/runtime/host-runtime.ts), but the button itself is now shown only to the current
 * VIP's phone, using the `vip` flag the host sends alongside the running game's own view
 * (`isVipInGame`, session/state.ts) -- the same platform-level signal lobby, menu and results
 * screens already carry, just delivered outside the game's own `data` this time.
 */
const isVip = computed(() => isVipInGame(props.state));

function endGame(): void {
  props.sendMessage(endGameAction());
}

const status = useGameController(() => props.state.gameId, controllers);

// One InputChannel per running game, over the shared link, at its declared stream rates. A
// running game controller is "playing" for the ping cadence (Channels, messages and rates).
const channel = computed(() =>
  status.value.kind === "ready" ? props.link.createChannel<GameInput>(status.value.streams) : null,
);
watch(channel, (_next, previous) => previous?.clear(), { flush: "sync" });
onMounted(() => props.link.setPlaying(true));
onBeforeUnmount(() => {
  channel.value?.clear();
  props.link.setPlaying(false);
});

const bound = computed(() =>
  controllerProps(
    props.state,
    send,
    controllerMotion(props.motion, props.state.gameId, motionAdapter),
    channel.value ?? undefined,
  ),
);

// The dev readout (docs/architecture/realtime-link.md, "What we measure"): path and round trip
// only, never an address. Hidden unless `?dev=1` is in the URL.
const devReadout = new URLSearchParams(globalThis.location?.search ?? "").get("dev") === "1";
</script>

<template>
  <component :is="status.component" v-if="status.kind === 'ready'" v-bind="bound" />
  <WaitingScreen v-else-if="status.kind === 'missing'" v-bind="missingGameCopy" />
  <WaitingScreen v-else v-bind="loadingControllerCopy" />
  <CcButton
    v-if="isVip"
    class="end-game"
    variant="stop"
    :disabled="!props.state.online"
    @press="endGame"
  >
    End game
  </CcButton>
  <p v-if="devReadout" class="link-dev-readout">
    {{ link.path }} · {{ link.rttMs === null ? "–" : `${Math.round(link.rttMs)} ms` }}
  </p>
</template>

<style scoped>
.end-game {
  position: fixed;
  top: var(--cc-space-4);
  right: var(--cc-space-4);
  z-index: 999;
}

.link-dev-readout {
  position: fixed;
  bottom: var(--cc-space-4);
  left: var(--cc-space-4);
  z-index: 999;
  margin: 0;
  padding: var(--cc-space-4) var(--cc-space-8);
  font-family: var(--cc-font-pixel);
  font-size: var(--cc-text-small-phone);
  color: var(--cc-chalk);
  background: var(--cc-ink);
  border-radius: var(--cc-radius-tag);
  pointer-events: none;
}
</style>
