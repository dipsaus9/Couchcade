<script setup lang="ts">
// The controller is portrait only (docs/HOUSE_STYLE.md, "Screen layouts"). A phone held sideways
// sees this panel on top of everything. Laptops and tablets with a mouse never do.
</script>

<template>
  <div class="rotate" role="alert">
    <div class="panel">
      <h1 class="title">Turn your phone upright</h1>
      <p class="body">The controller works in portrait.</p>
    </div>
  </div>
</template>

<style scoped>
.rotate {
  display: none;
}

@media (orientation: landscape) and (pointer: coarse) {
  .rotate {
    position: fixed;
    inset: 0;
    z-index: 10;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--cc-space-4);
    background: var(--cc-sky);
  }
}

.panel {
  padding: var(--cc-space-6);
  text-align: center;
  background: var(--cc-chalk);
  border: var(--cc-outline-phone) solid var(--cc-ink);
  border-radius: var(--cc-radius-panel);
  box-shadow: var(--cc-depth-panel);
}

.title {
  margin: 0 0 var(--cc-space-2);
  font-size: var(--cc-text-title-phone);
  font-weight: var(--cc-text-title-weight);
}

.body {
  margin: 0;
  font-size: var(--cc-text-body-phone);
}
</style>
