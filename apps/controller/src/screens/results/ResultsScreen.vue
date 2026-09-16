<script setup lang="ts">
import type { PhoneToRelayMessage } from "@couchcade/protocol";
import { CcButton } from "@couchcade/ui";
import { placeLabel, resultsActions, type ResultsView } from "./results-view.ts";

// Every in-game player's results (docs/design/platform-screens.md, "After a game"): their place and
// score. Only the VIP also gets "Play again" and "Back to menu" (session-flow.md owner decisions).
// CC-4.8 restyles it from the UI kit.

const props = defineProps<{ view: ResultsView }>();
const emit = defineEmits<{ send: [message: PhoneToRelayMessage] }>();
</script>

<template>
  <section class="screen">
    <div class="status" role="status">
      <p v-if="props.view.place !== undefined" class="place">{{ placeLabel(props.view.place) }}</p>
      <h1 class="title">{{ props.view.title }} is over</h1>
      <p v-if="props.view.score !== undefined" class="body">{{ props.view.score }} points</p>
    </div>

    <div v-if="props.view.vip" class="vip">
      <CcButton
        variant="primary"
        block
        :disabled="!props.view.vip.canPlayAgain"
        @press="emit('send', resultsActions.playAgain())"
      >
        Play again
      </CcButton>
      <p v-if="props.view.vip.hint" class="hint">{{ props.view.vip.hint }}</p>
      <CcButton block @press="emit('send', resultsActions.backToMenu())">Back to menu</CcButton>
    </div>
    <p v-else class="footnote">
      {{
        props.view.vipName ? `${props.view.vipName} picks what's next` : "The VIP picks what's next"
      }}
    </p>
  </section>
</template>

<style scoped>
.screen {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: var(--cc-space-6);
}

.status {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--cc-space-2);
  text-align: center;
}

.place {
  margin: 0;
  font-family: var(--cc-text-score-font);
  font-size: var(--cc-text-score-phone);
}

.title,
.body,
.hint,
.footnote {
  margin: 0;
}

.title {
  font-size: var(--cc-text-title-phone);
  font-weight: var(--cc-text-title-weight);
}

.body {
  font-size: var(--cc-text-body-phone);
  font-weight: 700;
}

.vip {
  display: flex;
  flex-direction: column;
  gap: var(--cc-space-3);
}

.hint {
  text-align: center;
  font-size: var(--cc-text-small-phone);
}

.footnote {
  text-align: center;
  font-size: var(--cc-text-small-phone);
}
</style>
