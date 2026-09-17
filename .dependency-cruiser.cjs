// Import boundaries from docs/architecture/platform.md, "Package map and dependency direction".
// `pnpm check:deps` runs these rules (tooling/check-deps). Paths are relative to the repo root.
// Every rule is a path pattern, so it applies to a package or game as soon as its folder exists.
// "Rule n" comments match the numbered "Import rules" in the doc.
//
// Tiers (an import may point down and skip tiers, never up or sideways):
//   apps  ->  games  ->  kit (stage, ui, motion)  ->  core (game-sdk, physics, audio)
//         ->  tier 1 (protocol, theme)  ->  utils
// The README and CC-1.19 draw kit and core as one band. The approved architecture splits it:
// kit may import core, core may not import kit.

/** A package path pattern for a list of package folder names. */
const pkg = (...names) => `^packages/(${names.join("|")})/`;

/** An npm package, found either in node_modules or as a bare name when it isn't installed. */
const npm = (...names) => `(^|(^|/)node_modules/)(${names.join("|")})(/|$)`;

// Config files (vite.config.ts, vitest.config.ts) may import @couchcade/config. src/ may not.
const CONFIG_FILE = "(^|/)[^/]+\\.config\\.[cm]?[jt]s$";

// The tier map. A new package folder must be added here (and to the architecture doc) first.
const TIER_1 = ["protocol", "theme"];
const CORE = ["game-sdk", "physics", "audio"];
const KIT = ["stage", "ui", "motion"];
const ALL_PACKAGES = ["utils", ...TIER_1, ...CORE, ...KIT, "config"];

const PHASER = npm("phaser");
const PLANCK = npm("planck");
const VUE = npm("vue", "@vue/[^/]+");

/** @type {import("dependency-cruiser").IConfiguration} */
module.exports = {
  forbidden: [
    // Rule 3: nothing imports from apps/*, tooling/* or e2e/.
    {
      name: "no-import-from-apps",
      comment: "Nothing imports from apps/*. Move shared code into a package.",
      severity: "error",
      from: { pathNot: "^apps/" },
      to: { path: "^apps/" },
    },
    {
      name: "no-app-imports-another-app",
      comment: "An app never imports another app. Move shared code into a package.",
      severity: "error",
      from: { path: "^apps/([^/]+)/" },
      to: { path: "^apps/", pathNot: "^apps/$1/" },
    },
    {
      name: "no-import-from-tooling-or-e2e",
      comment: "Nothing imports from tooling/* or e2e/. They may import packages, not the reverse.",
      severity: "error",
      from: { pathNot: "^(tooling|e2e)/" },
      to: { path: "^(tooling|e2e)/" },
    },
    {
      name: "no-tool-imports-another-tool",
      comment: "A tool never imports another tool or the E2E suite.",
      severity: "error",
      from: { path: "^tooling/([^/]+)/" },
      to: { path: "^(tooling|e2e)/", pathNot: "^tooling/$1/" },
    },
    {
      name: "no-e2e-imports-tooling",
      comment: "The E2E suite never imports a tool.",
      severity: "error",
      from: { path: "^e2e/" },
      to: { path: "^tooling/" },
    },

    // Rule 2: games never import other games. Packages never import games.
    {
      name: "no-game-imports-another-game",
      comment: "A game never imports another game. Anything two games need moves into a package.",
      severity: "error",
      from: { path: "^games/([^/]+)/" },
      to: { path: "^games/", pathNot: "^games/$1/" },
    },
    {
      name: "no-package-imports-a-game",
      comment: "A package never imports a game. The apps own the registry glob.",
      severity: "error",
      from: { path: "^packages/" },
      to: { path: "^games/" },
    },

    // Rule 1: the package tiers.
    {
      name: "package-has-a-tier",
      comment:
        "Every package under packages/ has a tier. Add a new package to the tier map in .dependency-cruiser.cjs and docs/architecture/platform.md.",
      severity: "error",
      from: { path: "^packages/", pathNot: pkg(...ALL_PACKAGES) },
      to: {},
    },
    {
      name: "utils-imports-nothing",
      comment: "utils has no dependencies at all, not even npm packages or Node built-ins.",
      severity: "error",
      from: { path: "^packages/utils/src/" },
      to: { pathNot: "^packages/utils/" },
    },
    {
      name: "utils-imports-no-package",
      comment: "utils is tier 0. Its tests and config may use npm tools, not other packages.",
      severity: "error",
      from: { path: pkg("utils") },
      to: { path: "^packages/", pathNot: `^packages/utils/|${pkg("config")}` },
    },
    {
      name: "tier-1-imports-only-utils",
      comment:
        "protocol and theme (tier 1) import only utils. Tier 1 packages never import each other.",
      severity: "error",
      from: { path: pkg(...TIER_1) },
      to: { path: "^packages/", pathNot: pkg("$1", "utils", "config") },
    },
    {
      name: "core-imports-only-tier-1-and-utils",
      comment:
        "game-sdk, physics and audio (core) import only protocol, theme and utils. Core packages never import each other or kit.",
      severity: "error",
      from: { path: pkg(...CORE) },
      to: { path: "^packages/", pathNot: pkg("$1", ...TIER_1, "utils", "config") },
    },
    {
      name: "kit-imports-only-core-tier-1-and-utils",
      comment:
        "stage, ui and motion (kit) import core, protocol, theme and utils. Kit packages never import each other.",
      severity: "error",
      from: { path: pkg(...KIT) },
      to: { path: "^packages/", pathNot: pkg("$1", ...CORE, ...TIER_1, "utils", "config") },
    },
    {
      name: "config-only-from-config-files",
      comment:
        "@couchcade/config is imported only by config files (vite.config.ts, vitest.config.ts), never by src/.",
      severity: "error",
      from: { path: "^(apps|games|packages|tooling|e2e)/", pathNot: [CONFIG_FILE, pkg("config")] },
      to: { path: pkg("config") },
    },

    // Rule 4: the relay only sees protocol and utils.
    {
      name: "server-imports-only-protocol-and-utils",
      comment:
        "apps/server imports only protocol, utils and its own npm dependencies. No games, game-sdk, theme or UI.",
      severity: "error",
      from: { path: "^apps/server/" },
      to: { path: "^(packages|games)/", pathNot: pkg("protocol", "utils", "config") },
    },

    // Rule 5: the phone bundle stays small.
    {
      name: "controller-app-no-tv-code",
      comment:
        "apps/controller never imports phaser, stage, physics or audio. The phone bundle stays within 80 KB.",
      severity: "error",
      from: { path: "^apps/controller/" },
      to: { path: [PHASER, pkg("stage", "physics", "audio")] },
    },

    // Rule 6: the host reaches a game only through src/index.ts, the phone only through the
    // game's controller entry src/controller/index.ts (owner decision, 16 September 2026).
    {
      name: "host-reaches-games-through-index",
      comment:
        "apps/host imports a game only through games/<id>/src/index.ts. It never imports src/controller/.",
      severity: "error",
      from: { path: "^apps/host/" },
      to: { path: "^games/", pathNot: "^games/[^/]+/src/index\\.ts$" },
    },
    {
      name: "controller-reaches-games-through-controller-entry",
      comment:
        "apps/controller imports a game only through games/<id>/src/controller/index.ts. It never loads the game's src/index.ts, so rules and physics stay on the TV.",
      severity: "error",
      from: { path: "^apps/controller/" },
      to: { path: "^games/", pathNot: "^games/[^/]+/src/controller/index\\.ts$" },
    },

    // Rule 7: inside a game.
    {
      name: "game-shared-stays-pure",
      comment:
        "games/<id>/src/shared/ imports only utils, protocol, game-sdk and physics. No host, controller, phaser, vue or Node built-ins.",
      severity: "error",
      from: { path: "^games/([^/]+)/src/shared/" },
      to: {
        path: ["^games/$1/src/(host/|controller/|index\\.ts$)", "^packages/", PHASER, VUE],
        pathNot: pkg("utils", "protocol", "game-sdk", "physics"),
      },
    },
    {
      name: "game-shared-no-node-builtins",
      comment:
        "games/<id>/src/shared/ runs on the TV and in tests alike. No Node built-ins (timers, fs, ...).",
      severity: "error",
      from: { path: "^games/[^/]+/src/shared/" },
      to: { dependencyTypes: ["core"] },
    },
    {
      name: "game-host-no-phone-code",
      comment: "games/<id>/src/host/ never imports the game's controller/, vue, ui or motion.",
      severity: "error",
      from: { path: "^games/([^/]+)/src/host/" },
      to: { path: ["^games/$1/src/controller/", VUE, pkg("ui", "motion")] },
    },
    {
      name: "game-controller-no-tv-code",
      comment:
        "games/<id>/src/controller/ never imports the game's host/, phaser, planck, stage, audio or physics.",
      severity: "error",
      from: { path: "^games/([^/]+)/src/controller/" },
      to: { path: ["^games/$1/src/host/", PHASER, PLANCK, pkg("stage", "audio", "physics")] },
    },
    {
      // A reachable rule follows every import, also through shared/ and packages. tooling/check-deps
      // checks reachable rules without type-only imports, because the build erases them: game-sdk's
      // contract type-imports phaser, and that never ships to a phone.
      name: "game-controller-never-reaches-physics",
      comment:
        "Nothing under games/<id>/src/controller/ may reach planck, @couchcade/physics or phaser, not even through shared/, so Planck.js never ships to phones. Move what the controller needs out of the shared/ module that imports physics.",
      severity: "error",
      from: { path: "^games/[^/]+/src/controller/" },
      to: { path: [PLANCK, pkg("physics"), PHASER], reachable: true },
    },
    {
      name: "game-index-imports-only-shared-and-sdk",
      comment:
        "games/<id>/src/index.ts statically imports only its shared/ and game-sdk. host/ loads through import().",
      severity: "error",
      from: { path: "^games/([^/]+)/src/index\\.ts$" },
      to: {
        pathNot: ["^games/$1/src/shared/", pkg("game-sdk")],
        dependencyTypesNot: ["dynamic-import"],
      },
    },
    {
      name: "game-index-lazy-loads-only-host",
      comment:
        "games/<id>/src/index.ts lazy loads only its own host/. Phones load src/controller/index.ts themselves, so the TV never bundles a Vue controller.",
      severity: "error",
      from: { path: "^games/([^/]+)/src/index\\.ts$" },
      to: {
        dependencyTypes: ["dynamic-import"],
        pathNot: "^games/$1/src/host/",
      },
    },

    // A workspace import that doesn't resolve would slip past every rule above.
    {
      name: "workspace-imports-resolve",
      comment:
        "An @couchcade/* import must resolve, or the boundaries can't be checked. Add the package to dependencies in package.json.",
      severity: "error",
      from: {},
      to: { couldNotResolve: true, path: "^@couchcade/" },
    },
  ],
  options: {
    doNotFollow: { path: "(^|/)node_modules/" },
    // Build output and local state in our own folders. npm packages stay visible (their files often live in dist/).
    // tooling/create-game/template/ holds placeholder source (__ID__, __TITLE__, ...) that's never
    // run as-is; it's only real code once `pnpm create-game` renders it into games/<id>, which the
    // tool's own test does and cruises for real (tooling/create-game/test/generate-and-verify.test.ts).
    exclude: {
      path: "^((apps|games|packages|tooling)/[^/]+|e2e)/(dist|\\.wrangler|coverage|playwright-report|test-results)/|^tooling/create-game/template/",
    },
    // Type-only imports count: a package that imports types from a higher tier still points up.
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default", "types"],
      extensions: [".ts", ".tsx", ".vue", ".js", ".mjs", ".cjs", ".json", ".d.ts"],
      mainFields: ["module", "main", "types"],
    },
  },
};
