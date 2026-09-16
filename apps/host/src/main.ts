// The theme tokens as CSS variables, generated at build time (vite.config.ts), the only source of
// colours, fonts and sizes. A stylesheet, never an inline <style>, so the CSP (style-src 'self')
// needs no relaxation.
// oxlint-disable-next-line import/no-unassigned-import
import "virtual:couchcade-theme.css";
import { createApp } from "vue";
import App from "./App.vue";
import { attachStage } from "./runtime/stage.ts";

createApp(App).mount("#app");

// Phaser is large, so it loads in its own chunk after the interface is up.
const stage = document.querySelector<HTMLElement>("#stage");
if (stage) {
  void import("./stage/boot.ts").then(({ bootStage }) => attachStage(bootStage(stage)));
}
