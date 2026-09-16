import { toCssVars } from "@couchcade/theme";

// Apps install the theme's CSS variables once; the components only read them.
const style = document.createElement("style");
style.textContent = `${toCssVars()}\nbody { margin: 0; background: var(--cc-chalk); }\n`;
document.head.append(style);
