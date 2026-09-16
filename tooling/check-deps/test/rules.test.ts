import { afterEach, describe, expect, it } from "vitest";
import { checkDeps } from "../src/check-deps.ts";
import { configFile, createFixtureRepo, removeFixtureRepo } from "./fixture-repo.ts";
import type { Files } from "./fixture-repo.ts";

const fixtures: string[] = [];

afterEach(() => {
  for (const rootDir of fixtures.splice(0)) removeFixtureRepo(rootDir);
});

/** Checks a fixture repo against the real rules and returns the names of the broken rules. */
async function brokenRules(files: Files): Promise<string[]> {
  const rootDir = createFixtureRepo(files);
  fixtures.push(rootDir);
  const { violations, errorCount } = await checkDeps({ rootDir, configFile });
  expect(errorCount).toBe(violations.length);
  return [...new Set(violations.map((violation) => violation.rule.name))].toSorted();
}

/** A game that follows every rule. Override a file to break one. */
function game(id: string, files: Files = {}): Files {
  return {
    [`games/${id}/package.json`]: JSON.stringify({ name: `@couchcade/game-${id}`, type: "module" }),
    [`games/${id}/src/index.ts`]: [
      'import { gamesdk } from "@couchcade/game-sdk";',
      'import { rules } from "./shared/rules.ts";',
      "export default {",
      "  gamesdk,",
      "  rules,",
      '  hostScene: () => import("./host/scene.ts"),',
      '  controller: () => import("./controller/Controller.vue"),',
      "};",
      "",
    ].join("\n"),
    [`games/${id}/src/shared/rules.ts`]: [
      'import { utils } from "@couchcade/utils";',
      'import type { protocol } from "@couchcade/protocol";',
      'import { gamesdk } from "@couchcade/game-sdk";',
      'import { physics } from "@couchcade/physics";',
      'import * as z from "zod";',
      "export const rules = { utils, gamesdk, physics, z } as unknown as typeof protocol;",
      "",
    ].join("\n"),
    [`games/${id}/src/host/scene.ts`]: [
      'import { rules } from "../shared/rules.ts";',
      'import { stage } from "@couchcade/stage";',
      'import { audio } from "@couchcade/audio";',
      'import { theme } from "@couchcade/theme";',
      'import Phaser from "phaser";',
      "export default { rules, stage, audio, theme, Phaser };",
      "",
    ].join("\n"),
    [`games/${id}/src/controller/Controller.vue`]: [
      '<script setup lang="ts">',
      'import { rules } from "../shared/rules.ts";',
      'import { ui } from "@couchcade/ui";',
      'import { motion } from "@couchcade/motion";',
      'import { ref } from "vue";',
      "const state = ref({ rules, ui, motion });",
      "</script>",
      "<template><p>{{ state }}</p></template>",
      "",
    ].join("\n"),
    [`games/${id}/vitest.config.ts`]: 'import "@couchcade/config";\n',
    ...files,
  };
}

/** Apps, packages, tools and a game wired up the way the architecture doc allows. */
function healthyRepo(): Files {
  return {
    ...game("quick-draw"),
    "apps/host/src/main.ts": [
      'import game from "../../../games/quick-draw/src/index.ts";',
      'import { stage } from "@couchcade/stage";',
      'import { gamesdk } from "@couchcade/game-sdk";',
      'import Phaser from "phaser";',
      "export default [game, stage, gamesdk, Phaser];",
      "",
    ].join("\n"),
    "apps/host/src/lobby.ts": 'import main from "./main.ts";\nexport default main;\n',
    "apps/host/vite.config.ts": 'import "@couchcade/config";\n',
    "apps/controller/src/main.ts": [
      'import game from "../../../games/quick-draw/src/index.ts";',
      'import { ui } from "@couchcade/ui";',
      'import { motion } from "@couchcade/motion";',
      'import { createApp } from "vue";',
      "export default [game, ui, motion, createApp];",
      "",
    ].join("\n"),
    "apps/server/src/worker.ts": [
      'import { protocol } from "@couchcade/protocol";',
      'import { utils } from "@couchcade/utils";',
      "export default [protocol, utils];",
      "",
    ].join("\n"),
    "packages/protocol/src/index.ts":
      'import { utils } from "@couchcade/utils";\nimport * as z from "zod";\nexport const protocol = [utils, z];\n',
    "packages/theme/src/index.ts":
      'import { utils } from "@couchcade/utils";\nexport const theme = utils;\n',
    "packages/game-sdk/src/index.ts": [
      'import { protocol } from "@couchcade/protocol";',
      'import { theme } from "@couchcade/theme";',
      'import type { Scene } from "phaser";',
      "export const gamesdk = [protocol, theme] as unknown as Scene;",
      "",
    ].join("\n"),
    "packages/physics/src/index.ts":
      'import { utils } from "@couchcade/utils";\nexport const physics = utils;\n',
    "packages/stage/src/index.ts": [
      'import { gamesdk } from "@couchcade/game-sdk";',
      'import { audio } from "@couchcade/audio";',
      'import { theme } from "@couchcade/theme";',
      'import Phaser from "phaser";',
      "export const stage = [gamesdk, audio, theme, Phaser];",
      "",
    ].join("\n"),
    "packages/ui/src/index.ts":
      'import { gamesdk } from "@couchcade/game-sdk";\nexport const ui = gamesdk;\n',
    "packages/motion/src/index.ts":
      'import { gamesdk } from "@couchcade/game-sdk/batching";\nexport const motion = gamesdk;\n',
    "packages/game-sdk/src/batching/index.ts": "export const gamesdk = 1;\n",
    "packages/utils/src/rng/index.ts":
      'import { utils } from "../index.ts";\nexport const rng = utils;\n',
    "packages/utils/test/rng.test.ts":
      'import * as z from "zod";\nimport { rng } from "../src/rng/index.ts";\nexport default [z, rng];\n',
    "packages/utils/vitest.config.ts": 'import "@couchcade/config";\n',
    "tooling/check-style/src/cli.ts":
      'import { theme } from "@couchcade/theme";\nexport default theme;\n',
    "e2e/games/quick-draw.spec.ts":
      'import { protocol } from "@couchcade/protocol";\nexport default protocol;\n',
  };
}

describe("check:deps rules", () => {
  it("passes a repo that follows the architecture doc", async () => {
    expect(await brokenRules(healthyRepo())).toEqual([]);
  });

  describe("rule 3: nothing imports apps, tooling or e2e", () => {
    it("fails a game that imports an app", async () => {
      const files = {
        ...healthyRepo(),
        ...game("quick-draw", {
          "games/quick-draw/src/host/scene.ts":
            'import lobby from "../../../../apps/host/src/lobby.ts";\nexport default lobby;\n',
        }),
      };
      expect(await brokenRules(files)).toEqual(["no-import-from-apps"]);
    });

    it("fails a package that imports an app", async () => {
      const files = {
        ...healthyRepo(),
        "packages/ui/src/index.ts":
          'import main from "../../../apps/controller/src/main.ts";\nexport const ui = main;\n',
      };
      expect(await brokenRules(files)).toContain("no-import-from-apps");
    });

    it("fails an app that imports another app", async () => {
      const files = {
        ...healthyRepo(),
        "apps/server/src/worker.ts":
          'import main from "../../host/src/main.ts";\nexport default main;\n',
      };
      expect(await brokenRules(files)).toContain("no-app-imports-another-app");
    });

    it("fails a package that imports a tool, and a tool that imports another tool", async () => {
      const files = {
        ...healthyRepo(),
        "tooling/budgets/src/cli.ts":
          'import cli from "../../check-style/src/cli.ts";\nexport default cli;\n',
        "packages/theme/src/index.ts":
          'import cli from "../../../tooling/check-style/src/cli.ts";\nexport const theme = cli;\n',
      };
      expect(await brokenRules(files)).toEqual([
        "no-import-from-tooling-or-e2e",
        "no-tool-imports-another-tool",
      ]);
    });

    it("fails the E2E suite importing a tool", async () => {
      const files = {
        ...healthyRepo(),
        "e2e/games/quick-draw.spec.ts":
          'import cli from "../../tooling/check-style/src/cli.ts";\nexport default cli;\n',
      };
      expect(await brokenRules(files)).toEqual(["no-e2e-imports-tooling"]);
    });
  });

  describe("rule 2: games and packages never import games", () => {
    it("fails a game that imports another game", async () => {
      const files = {
        ...healthyRepo(),
        ...game("sumo"),
        ...game("quick-draw", {
          "games/quick-draw/src/shared/rules.ts":
            'import { rules as sumo } from "../../../sumo/src/shared/rules.ts";\nexport const rules = sumo;\n',
        }),
      };
      expect(await brokenRules(files)).toEqual(["no-game-imports-another-game"]);
    });

    it("fails a package that imports a game", async () => {
      const files = {
        ...healthyRepo(),
        "packages/game-sdk/src/index.ts":
          'import game from "../../../games/quick-draw/src/index.ts";\nexport const gamesdk = game;\n',
      };
      expect(await brokenRules(files)).toContain("no-package-imports-a-game");
    });
  });

  describe("rule 1: package tiers", () => {
    it("fails utils importing an npm package or a Node built-in", async () => {
      const files = {
        ...healthyRepo(),
        "packages/utils/src/index.ts":
          'import * as z from "zod";\nimport { readFileSync } from "node:fs";\nexport const utils = [z, readFileSync];\n',
      };
      expect(await brokenRules(files)).toEqual(["utils-imports-nothing"]);
    });

    it("fails utils importing another package, even from a test", async () => {
      const files = {
        ...healthyRepo(),
        "packages/utils/test/rng.test.ts":
          'import { theme } from "@couchcade/theme";\nexport default theme;\n',
      };
      expect(await brokenRules(files)).toEqual(["utils-imports-no-package"]);
    });

    it("fails tier 1 importing core or a tier 1 sibling", async () => {
      const files = {
        ...healthyRepo(),
        "packages/protocol/src/index.ts":
          'import { theme } from "@couchcade/theme";\nexport const protocol = theme;\n',
        "packages/theme/src/index.ts":
          'import type { gamesdk } from "@couchcade/game-sdk";\nexport const theme = 1 as unknown as typeof gamesdk;\n',
      };
      const violations = await brokenRules(files);
      expect(violations).toEqual(["tier-1-imports-only-utils"]);
    });

    it("counts a type-only import that points up", async () => {
      const files = {
        ...healthyRepo(),
        "packages/theme/src/index.ts":
          'import type { stage } from "@couchcade/stage";\nexport const theme = 1 as unknown as typeof stage;\n',
      };
      expect(await brokenRules(files)).toEqual(["tier-1-imports-only-utils"]);
    });

    it("fails core importing kit or a core sibling", async () => {
      const coreToKit = {
        ...healthyRepo(),
        "packages/game-sdk/src/index.ts":
          'import { stage } from "@couchcade/stage";\nexport const gamesdk = stage;\n',
      };
      expect(await brokenRules(coreToKit)).toContain("core-imports-only-tier-1-and-utils");

      const coreToCore = {
        ...healthyRepo(),
        "packages/physics/src/index.ts":
          'import { audio } from "@couchcade/audio";\nexport const physics = audio;\n',
      };
      expect(await brokenRules(coreToCore)).toEqual(["core-imports-only-tier-1-and-utils"]);
    });

    it("lets kit import core but not a kit sibling", async () => {
      const files = {
        ...healthyRepo(),
        "packages/ui/src/index.ts":
          'import { stage } from "@couchcade/stage";\nexport const ui = stage;\n',
      };
      expect(await brokenRules(files)).toEqual(["kit-imports-only-core-tier-1-and-utils"]);
    });

    it("fails a package that isn't in the tier map", async () => {
      const files = {
        ...healthyRepo(),
        "packages/leaderboard/package.json": JSON.stringify({ name: "@couchcade/leaderboard" }),
        "packages/leaderboard/src/index.ts":
          'import { utils } from "../../utils/src/index.ts";\nexport default utils;\n',
      };
      expect(await brokenRules(files)).toEqual(["package-has-a-tier"]);
    });

    it("fails src/ importing @couchcade/config", async () => {
      const files = {
        ...healthyRepo(),
        "apps/host/src/lobby.ts": 'import "@couchcade/config";\nexport default 1;\n',
      };
      expect(await brokenRules(files)).toEqual(["config-only-from-config-files"]);
    });

    it("fails an @couchcade import that doesn't resolve", async () => {
      const files = {
        ...healthyRepo(),
        "packages/stage/src/index.ts":
          'import { nope } from "@couchcade/nope";\nexport const stage = nope;\n',
      };
      expect(await brokenRules(files)).toEqual(["workspace-imports-resolve"]);
    });
  });

  describe("rules 4 to 6: apps", () => {
    it("fails the server importing game-sdk or a game", async () => {
      const files = {
        ...healthyRepo(),
        "apps/server/src/worker.ts": [
          'import { gamesdk } from "@couchcade/game-sdk";',
          'import game from "../../../games/quick-draw/src/index.ts";',
          "export default [gamesdk, game];",
          "",
        ].join("\n"),
      };
      expect(await brokenRules(files)).toEqual(["server-imports-only-protocol-and-utils"]);
    });

    it("fails the controller app importing phaser or stage", async () => {
      const files = {
        ...healthyRepo(),
        "apps/controller/src/main.ts":
          'import Phaser from "phaser";\nimport { stage } from "@couchcade/stage";\nexport default [Phaser, stage];\n',
      };
      expect(await brokenRules(files)).toEqual(["controller-app-no-tv-code"]);
    });

    it("fails an app that imports a game's host or controller code directly", async () => {
      const files = {
        ...healthyRepo(),
        "apps/host/src/lobby.ts":
          'import Controller from "../../../games/quick-draw/src/controller/Controller.vue";\nexport default Controller;\n',
        "apps/controller/src/main.ts":
          'import scene from "../../../games/quick-draw/src/host/scene.ts";\nexport default scene;\n',
      };
      expect(await brokenRules(files)).toEqual(["apps-reach-games-through-index"]);
    });
  });

  describe("rule 7: inside a game", () => {
    it("fails shared code importing phaser, vue, a kit package or the game's host", async () => {
      const files = {
        ...healthyRepo(),
        ...game("quick-draw", {
          "games/quick-draw/src/shared/rules.ts": [
            'import Phaser from "phaser";',
            'import { ref } from "vue";',
            'import { stage } from "@couchcade/stage";',
            'import scene from "../host/scene.ts";',
            "export const rules = [Phaser, ref, stage, scene];",
            "",
          ].join("\n"),
        }),
      };
      expect(await brokenRules(files)).toEqual(["game-shared-stays-pure"]);
    });

    it("fails shared code importing a Node built-in such as timers", async () => {
      const files = {
        ...healthyRepo(),
        ...game("quick-draw", {
          "games/quick-draw/src/shared/rules.ts":
            'import { setTimeout } from "node:timers";\nexport const rules = setTimeout;\n',
        }),
      };
      expect(await brokenRules(files)).toEqual(["game-shared-no-node-builtins"]);
    });

    it("fails host code importing vue, ui or the game's controller", async () => {
      const files = {
        ...healthyRepo(),
        ...game("quick-draw", {
          "games/quick-draw/src/host/scene.ts": [
            'import { ref } from "vue";',
            'import { ui } from "@couchcade/ui";',
            'import Controller from "../controller/Controller.vue";',
            "export default [ref, ui, Controller];",
            "",
          ].join("\n"),
        }),
      };
      expect(await brokenRules(files)).toEqual(["game-host-no-phone-code"]);
    });

    it("fails a Vue controller importing phaser, stage or the game's host", async () => {
      const files = {
        ...healthyRepo(),
        ...game("quick-draw", {
          "games/quick-draw/src/controller/Controller.vue": [
            '<script setup lang="ts">',
            'import Phaser from "phaser";',
            'import { stage } from "@couchcade/stage";',
            'import scene from "../host/scene.ts";',
            "const all = [Phaser, stage, scene];",
            "</script>",
            "<template><p>{{ all }}</p></template>",
            "",
          ].join("\n"),
        }),
      };
      expect(await brokenRules(files)).toEqual(["game-controller-no-tv-code"]);
    });

    it("checks a Vue component with TypeScript that nothing imports yet", async () => {
      const files = {
        ...healthyRepo(),
        "games/quick-draw/src/controller/AimPad.vue": [
          '<script lang="ts">',
          "export interface AimPadProps { sensitivity: number }",
          "</script>",
          '<script setup lang="ts">',
          'import type { Scene } from "phaser";',
          "const props = defineProps<AimPadProps>();",
          "const scene: Scene | undefined = undefined;",
          "</script>",
          '<template><p v-if="props.sensitivity < 2">{{ scene }}</p></template>',
          "",
        ].join("\n"),
      };
      expect(await brokenRules(files)).toEqual(["game-controller-no-tv-code"]);
    });

    it("fails index.ts importing host code statically or lazy loading anything else", async () => {
      const files = {
        ...healthyRepo(),
        ...game("quick-draw", {
          "games/quick-draw/src/index.ts": [
            'import scene from "./host/scene.ts";',
            'import { ui } from "@couchcade/ui";',
            "export default {",
            "  scene,",
            "  ui,",
            '  hostScene: () => import("phaser"),',
            "};",
            "",
          ].join("\n"),
        }),
      };
      expect(await brokenRules(files)).toEqual([
        "game-index-imports-only-shared-and-sdk",
        "game-index-lazy-loads-only-host-and-controller",
      ]);
    });
  });
});
