<script setup lang="ts">
import type { PhoneToRelayMessage } from "@couchcade/protocol";
import { computed } from "vue";
import { motionAdapter } from "../motion/adapter.ts";
import type { MotionGame } from "../motion/session.ts";
import WaitingScreen from "../screens/waiting/WaitingScreen.vue";
import { loadingControllerCopy, missingGameCopy } from "./copy.ts";
import {
  controllerMotion,
  controllerProps,
  useGameController,
  type GameState,
} from "./controller.ts";
import { controllers } from "./games.ts";
import { createInputSender } from "./send.ts";

// The running game's controller (docs/architecture/platform.md, "How the phone shows a
// controller"): its phone entry loads by game id and gets the latest view as props, plus the motion
// step's result for a motion game.

const props = defineProps<{
  state: GameState;
  sendMessage: (message: PhoneToRelayMessage) => void;
  /** The motion session's game, null outside a motion game. */
  motion: MotionGame | null;
}>();

const send = createInputSender({
  sendMessage: (message) => props.sendMessage(message),
  canSend: () => props.state.role === "player" && props.state.online,
});

const status = useGameController(() => props.state.gameId, controllers);
const bound = computed(() =>
  controllerProps(
    props.state,
    send,
    controllerMotion(props.motion, props.state.gameId, motionAdapter),
  ),
);
</script>

<template>
  <component :is="status.component" v-if="status.kind === 'ready'" v-bind="bound" />
  <WaitingScreen v-else-if="status.kind === 'missing'" v-bind="missingGameCopy" />
  <WaitingScreen v-else v-bind="loadingControllerCopy" />
</template>
