<script setup lang="ts">
import { toHostTime } from "@couchcade/game-sdk/clock";
import type { PhoneToRelayMessage } from "@couchcade/protocol";
import { CcButton } from "@couchcade/ui";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { menuActions, secondsLeft, type MenuItem, type MenuView } from "./menu-view.ts";

// The VIP's game list (docs/architecture/session-flow.md, "Game menu"). A tap picks a game and the
// TV counts down from 3. Tapping another game restarts the count, "Back" cancels it. Games that
// don't fit the player count stay in the list, greyed out. CC-4.8 restyles it.

const props = defineProps<{ view: MenuView }>();
const emit = defineEmits<{ send: [message: PhoneToRelayMessage] }>();

const picked = computed(() => props.view.games.find((game) => game.id === props.view.picked));
const someDontFit = computed(() => props.view.games.some((game) => !game.fits));

const roomNow = () => toHostTime(performance.timeOrigin + performance.now());
const seconds = ref<number | null>(null);
let timer: ReturnType<typeof setInterval> | null = null;
const tick = () => {
  const { startsAt } = props.view;
  seconds.value = startsAt === null ? null : secondsLeft(startsAt, roomNow());
};
watch(
  () => props.view.startsAt,
  (startsAt) => {
    tick();
    if (startsAt !== null && timer === null) timer = setInterval(tick, 200);
    if (startsAt === null && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  if (timer !== null) clearInterval(timer);
});

function pick(game: MenuItem): void {
  if (!game.fits || game.id === props.view.picked) return;
  emit("send", menuActions.pick(game.id));
}
</script>

<template>
  <section class="screen">
    <div class="head">
      <h1 class="title">Pick a game</h1>
      <p class="body">Tap a game. The TV counts down from 3.</p>
    </div>

    <ul class="list" aria-label="Games">
      <li v-for="game in view.games" :key="game.id">
        <CcButton
          block
          :variant="game.id === view.picked ? 'primary' : 'quiet'"
          :disabled="!game.fits"
          @press="pick(game)"
        >
          {{ game.title }}
          <span v-if="game.needsMotion" class="tag">Motion</span>
        </CcButton>
      </li>
    </ul>
    <p v-if="someDontFit" class="hint">Grey games don't fit this many players.</p>

    <div v-if="picked && seconds !== null" class="countdown">
      <p class="status" role="status">
        {{ picked.title }} starts in <span class="number">{{ seconds }}</span>
      </p>
      <CcButton block @press="emit('send', menuActions.cancel())">Back</CcButton>
    </div>
  </section>
</template>

<style scoped>
.screen {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: var(--cc-space-5);
}

.head {
  display: flex;
  flex-direction: column;
  gap: var(--cc-space-1);
}

.title,
.body,
.hint,
.status {
  margin: 0;
}

.title {
  font-size: var(--cc-text-title-phone);
  font-weight: var(--cc-text-title-weight);
}

.body,
.status {
  font-size: var(--cc-text-body-phone);
}

.list {
  display: flex;
  flex-direction: column;
  gap: var(--cc-space-4);
  margin: 0;
  padding: 0;
  list-style: none;
}

.tag {
  padding: 0 var(--cc-space-2);
  font-size: var(--cc-text-small-phone);
  background: var(--cc-sky);
  border: var(--cc-outline-phone) solid var(--cc-ink);
  border-radius: var(--cc-radius-tag);
}

.hint {
  font-size: var(--cc-text-small-phone);
  text-align: center;
}

.countdown {
  display: flex;
  flex-direction: column;
  gap: var(--cc-space-3);
  margin-top: auto;
}

.status {
  text-align: center;
  font-weight: var(--cc-text-title-weight);
}

.number {
  font-family: var(--cc-text-score-font);
  font-size: var(--cc-text-score-phone);
}
</style>
