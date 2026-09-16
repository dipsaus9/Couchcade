import { toCssVars } from "@couchcade/theme";
import { createApp } from "vue";
import App from "./App.vue";
import { attachStage } from "./runtime/stage.ts";

// The theme's tokens as CSS variables, the only source of colours, fonts and sizes.
const tokens = document.createElement("style");
tokens.textContent = toCssVars();
document.head.append(tokens);

createApp(App).mount("#app");

// Phaser is large, so it loads in its own chunk after the interface is up.
const stage = document.querySelector<HTMLElement>("#stage");
if (stage) {
  void import("./stage/boot.ts").then(({ bootStage }) => attachStage(bootStage(stage)));
}
