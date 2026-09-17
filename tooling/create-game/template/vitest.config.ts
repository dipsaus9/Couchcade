import { defineLibConfig } from "@couchcade/config/vite";

// Every test here (test/contract.test.ts, test/rules.test.ts) is pure TS running in Node. Add a
// browser or jsdom project (see games/quick-draw/vitest.config.ts) once this game has a scene
// boot test or a controller component test.
export default defineLibConfig();
