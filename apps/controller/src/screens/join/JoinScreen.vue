<script setup lang="ts">
import { computed, ref } from "vue";
import { codeHint, nameHint, noticeCopy } from "../../join/copy.ts";
import {
  checkJoinForm,
  cleanRoomCodeInput,
  nameLength,
  nameMaxLength,
  type JoinDraft,
} from "../../join/form.ts";
import type { Notice } from "../../session/state.ts";

// Join a room by QR link or typed code, then pick a name (docs/design/platform-screens.md, "Join").
// Plainly styled with theme tokens; CC-4.8 rebuilds it from the UI kit.

const props = defineProps<{ draft: JoinDraft; submitting: boolean; notice: Notice | null }>();
const emit = defineEmits<{ join: [draft: JoinDraft] }>();

const code = ref(props.draft.code);
const name = ref(props.draft.name);

const check = computed(() => checkJoinForm({ code: code.value, name: name.value }));
const fromUrl = computed(() => props.draft.codeFromUrl && code.value === props.draft.code);
const codeLine = computed(() =>
  fromUrl.value ? codeHint["from-url"] : codeHint[check.value.code ?? "ok"],
);
const nameLine = computed(() => nameHint[check.value.name ?? "ok"]);
const count = computed(() => `${nameLength(name.value)}/${nameMaxLength}`);

function onCodeInput(event: Event): void {
  const input = event.target as HTMLInputElement;
  code.value = cleanRoomCodeInput(input.value);
  // Keep the field in step when cleaning removed characters.
  input.value = code.value;
}

function submit(): void {
  if (!check.value.ready || props.submitting) return;
  emit("join", { code: code.value, name: name.value, codeFromUrl: fromUrl.value });
}
</script>

<template>
  <section class="screen">
    <h1 class="brand">Couchcade</h1>

    <form class="panel" novalidate @submit.prevent="submit">
      <span class="tab">Join a game</span>

      <label class="label" for="room-code">Room code</label>
      <input
        id="room-code"
        class="field code"
        :value="code"
        type="text"
        inputmode="text"
        autocapitalize="characters"
        autocomplete="off"
        autocorrect="off"
        spellcheck="false"
        maxlength="4"
        aria-describedby="room-code-hint"
        @input="onCodeInput"
      />
      <p id="room-code-hint" class="hint" :class="{ ok: fromUrl }">
        <span v-if="fromUrl" aria-hidden="true">✓ </span>{{ codeLine }}
      </p>

      <p v-if="notice" class="notice" role="alert">{{ noticeCopy(notice) }}</p>

      <label class="label" for="player-name">Your name</label>
      <div class="name-row">
        <input
          id="player-name"
          v-model="name"
          class="field"
          type="text"
          autocomplete="nickname"
          autocapitalize="words"
          enterkeyhint="go"
          :maxlength="nameMaxLength"
          placeholder="1 to 12 letters"
          aria-describedby="player-name-hint"
        />
        <span class="count" aria-hidden="true">{{ count }}</span>
      </div>
      <p id="player-name-hint" class="hint">{{ nameLine }}</p>

      <button class="join" type="submit" :disabled="!check.ready || submitting">
        {{ submitting ? "Joining…" : "Join" }}
      </button>
    </form>

    <p class="footnote">
      {{
        fromUrl ? "Your phone becomes the controller." : "Scanning the QR code fills in the room."
      }}
    </p>
  </section>
</template>

<style scoped>
.screen {
  display: flex;
  flex-direction: column;
  gap: var(--cc-space-6);
}

.brand {
  margin: 0;
  font-size: var(--cc-text-title-phone);
  font-weight: var(--cc-text-title-weight);
}

.panel {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--cc-space-3);
  padding: var(--cc-space-6) var(--cc-space-4);
  background: var(--cc-chalk);
  border: var(--cc-outline-phone) solid var(--cc-ink);
  border-radius: var(--cc-radius-panel);
  box-shadow: var(--cc-depth-panel);
}

.tab {
  position: absolute;
  top: calc(-1 * var(--cc-space-4));
  left: var(--cc-space-4);
  padding: var(--cc-space-1) var(--cc-space-3);
  background: var(--cc-sky);
  border: var(--cc-outline-phone) solid var(--cc-ink);
  border-radius: var(--cc-radius-tag);
  font-size: var(--cc-text-small-phone);
  font-weight: var(--cc-text-title-weight);
}

.label {
  font-size: var(--cc-text-small-phone);
  font-weight: var(--cc-text-title-weight);
}

.field {
  box-sizing: border-box;
  width: 100%;
  min-height: var(--cc-touch-min);
  padding: 0 var(--cc-space-4);
  color: var(--cc-ink);
  background: var(--cc-chalk);
  border: var(--cc-outline-phone) solid var(--cc-ink);
  border-radius: var(--cc-radius-panel);
  font: inherit;
  font-size: var(--cc-text-body-phone);
}

.field:focus-visible,
.join:focus-visible {
  outline: var(--cc-focus-ring-width) solid var(--cc-sunny);
  outline-offset: var(--cc-focus-ring-offset);
}

.code {
  font-family: var(--cc-font-pixel);
  font-size: var(--cc-text-score-phone);
  font-weight: var(--cc-text-score-weight);
  letter-spacing: var(--cc-space-3);
  text-transform: uppercase;
}

.name-row {
  position: relative;
}

.name-row .field {
  padding-right: var(--cc-space-8);
}

.count {
  position: absolute;
  top: 50%;
  right: var(--cc-space-4);
  transform: translateY(-50%);
  color: var(--cc-ink-70);
  font-size: var(--cc-text-small-phone);
}

.hint,
.footnote {
  margin: 0;
  font-size: var(--cc-text-small-phone);
}

.hint {
  color: var(--cc-ink-70);
}

.hint.ok {
  color: var(--cc-ink);
}

.footnote {
  text-align: center;
}

.notice {
  margin: 0;
  padding: var(--cc-space-3) var(--cc-space-4);
  border: var(--cc-outline-phone) solid var(--cc-signal);
  border-radius: var(--cc-radius-panel);
  font-size: var(--cc-text-small-phone);
}

.join {
  min-height: var(--cc-touch-min);
  margin-top: var(--cc-space-4);
  color: var(--cc-ink);
  background: var(--cc-sunny);
  border: var(--cc-outline-phone) solid var(--cc-ink);
  border-radius: var(--cc-radius-pill);
  box-shadow: var(--cc-depth-rest);
  font: inherit;
  font-size: var(--cc-text-action-phone);
  font-weight: var(--cc-text-action-weight);
}

.join:active:not(:disabled) {
  box-shadow: var(--cc-depth-pressed);
  transform: translateY(var(--cc-press-offset));
}

.join:disabled {
  color: var(--cc-ink-45);
  background: var(--cc-chalk);
  border-color: var(--cc-ink-20);
  box-shadow: none;
}
</style>
