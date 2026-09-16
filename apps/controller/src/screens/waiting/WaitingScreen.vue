<script setup lang="ts">
// "Watch the TV" between lobby and game, and while the phone connects
// (docs/design/platform-screens.md, "Waiting"). CC-4.8 restyles it from the UI kit.

defineProps<{ title: string; body: string; hint?: string }>();
</script>

<template>
  <section class="screen">
    <div class="status" role="status">
      <h1 class="title">{{ title }}</h1>
      <p class="body">{{ body }}</p>
    </div>
    <p v-if="hint" class="hint">{{ hint }}</p>
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

.title {
  margin: 0;
  font-size: var(--cc-text-title-phone);
  font-weight: var(--cc-text-title-weight);
}

.body {
  margin: 0;
  font-size: var(--cc-text-body-phone);
}

.hint {
  margin: 0;
  text-align: center;
  font-size: var(--cc-text-small-phone);
}
</style>
