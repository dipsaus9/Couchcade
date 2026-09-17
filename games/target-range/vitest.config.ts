import { defineLibConfig } from "@couchcade/config/vite";

// Every test here (rules, flight, view, snapshot, contract, determinism and the recorded replay)
// is pure TS running in Node. Add a browser or jsdom project (see games/quick-draw/vitest.config.ts)
// once CC-11.4 adds a scene boot test or CC-11.3 a controller component test.
export default defineLibConfig();
