<script setup lang="ts">
import type { PhoneToRelayMessage, PlayerInfo } from "@couchcade/protocol";
import { players } from "@couchcade/theme";
import { CcButton, CcPlayerChip } from "@couchcade/ui";
import { computed, defineAsyncComponent, ref } from "vue";
import { reconcileOnEntry } from "../../pips/reconcile.ts";
import { lookForSlot } from "../../session/look.ts";
import { menuActions } from "../menu/menu-view.ts";

// The phone in the lobby: its name, colour and shape (docs/design/platform-screens.md, "Lobby").
// The VIP also gets "Choose a game" and "Surprise me" (CC-3.2). Built from the UI kit's
// CcPlayerChip, whose plain Sky circle is the audience look, plus the Pip customiser (CC-6.5),
// which opens here and sends every change straight through this screen's own `send` emit. The
// customiser is a lazy chunk (pips.md Budgets: "Customiser screen as a lazy chunk <= 4 KB"), so
// it never lands in the phone's 80 KB initial JS.
const PipCustomiserPanel = defineAsyncComponent(() => import("../../pips/PipCustomiser.vue"));

const props = defineProps<{
  you: PlayerInfo;
  role: "player" | "audience";
  code: string;
  hostConnected: boolean;
  online: boolean;
  /** True when the host made this phone the VIP. */
  vip: boolean;
}>();
const emit = defineEmits<{ send: [message: PhoneToRelayMessage] }>();

const look = computed(() => (props.role === "player" ? lookForSlot(props.you.slot) : null));
// CcPlayerChip takes the theme's player id, not the look's colour/shape pair.
const playerId = computed(() =>
  props.role === "player" && props.you.slot !== null ? players[props.you.slot]?.id : undefined,
);

// Fixes a returning phone's Pip on the TV even if it never opens the customiser (pips.md "When
// the Pip is sent" item 2): loads or creates `couchcade:player` and sends one `player:profile` if
// it disagrees with what the room seated `you` with. Runs once per lobby visit, not gated on
// `customising`, unlike the panel itself, which is a lazy chunk that may never load this session.
reconcileOnEntry(props.you, (message) => emit("send", message));

const customising = ref(false);
</script>

<template>
  <section class="screen">
    <div class="chip-row">
      <CcPlayerChip :player="playerId" :name="you.name" />
      <span class="tag">{{ look ? look.seatLabel : "Audience" }}</span>
    </div>

    <PipCustomiserPanel v-if="customising" :you="you" @send="emit('send', $event)" />

    <template v-else>
      <div class="status" role="status">
        <template v-if="look">
          <h1 class="title">You're in, {{ you.name }}</h1>
          <p class="body">You're {{ look.colourName }}, the {{ look.shape }}. Watch the TV.</p>
        </template>
        <template v-else>
          <h1 class="title">Watching</h1>
          <p class="body">
            All 8 player spots are taken. You get the next free spot between games.
          </p>
        </template>
        <p v-if="!online" class="body">Reconnecting you as {{ you.name }}. Keep this page open.</p>
        <p v-else-if="!hostConnected" class="body">Waiting for the TV. Keep this page open.</p>
      </div>

      <div v-if="vip && look && online && hostConnected" class="vip">
        <p class="body">You're the VIP. Pick the first game when everyone's in.</p>
        <CcButton variant="primary" block @press="emit('send', menuActions.chooseGame())">
          Choose a game
        </CcButton>
        <CcButton block @press="emit('send', menuActions.surpriseMe())">Surprise me</CcButton>
      </div>
    </template>

    <CcButton block @press="customising = !customising">
      {{ customising ? "Done" : vip ? "Edit my Pip" : "Make your Pip" }}
    </CcButton>

    <p class="footnote">Room {{ code }}. The first player starts the game.</p>
  </section>
</template>

<style scoped>
.screen {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: var(--cc-space-6);
}

.chip-row {
  display: flex;
  align-items: center;
  gap: var(--cc-space-3);
  align-self: flex-start;
}

.tag {
  padding: var(--cc-space-1) var(--cc-space-3);
  background: var(--cc-chalk);
  border: var(--cc-outline-phone) solid var(--cc-ink);
  border-radius: var(--cc-radius-tag);
  font-size: var(--cc-text-small-phone);
  font-weight: var(--cc-text-title-weight);
}

.status {
  display: flex;
  flex: 1;
  flex-direction: column;
  justify-content: center;
  gap: var(--cc-space-2);
}

.title {
  margin: 0;
  font-size: var(--cc-text-title-phone);
  font-weight: var(--cc-text-title-weight);
}

.body {
  margin: 0;
  font-size: var(--cc-text-body-phone);
}

.vip {
  display: flex;
  flex-direction: column;
  gap: var(--cc-space-3);
}

.footnote {
  margin: 0;
  text-align: center;
  font-size: var(--cc-text-small-phone);
}
</style>
