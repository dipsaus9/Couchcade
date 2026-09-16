# E2E tests

Playwright tests that drive one TV and several phones against the local dev server. Every test runs on Chromium and WebKit.

```bash
pnpm e2e
```

That installs the browsers when they are missing, starts `pnpm dev` (or reuses one already on `:5173`), and runs every spec. The config is `e2e/playwright.config.ts`. There is no root `playwright.config.ts`, because `@playwright/test` is only installed in this package.

## Local secrets

The dev server reads `apps/server/.dev.vars`. When the file is missing, the config copies it from `apps/server/.dev.vars.example`, which holds test values only. An existing file is never read or changed. The tests type the example's `HOST_PASSCODE` into the TV's passcode form. If your own `.dev.vars` uses another passcode, run with `E2E_HOST_PASSCODE=<yours> pnpm e2e`.

## Where specs go

| Folder | What |
|---|---|
| `platform/*.spec.ts` | Platform flows: joining, reconnects, host recovery, motion permission |
| `games/<id>.spec.ts` | One bot-plays-a-match test per game |
| `src/` | Fixtures and shared steps. Specs import these, never each other. |

## Devices

Import `test` and `expect` from `src/fixtures.ts`:

```ts
import { expect, test } from "../src/fixtures.ts";
import { joinRoom, openRoom } from "../src/flows.ts";

test("two phones join", async ({ host, phones }) => {
  const code = await openRoom(host);
  const [ana, ben] = await phones(2);
  await joinRoom(ana!, code, "Ana");
  await joinRoom(ben!, code, "Ben");
});
```

- `host` is the TV: its own browser context with a 1920×1080 viewport, open at `/host/`.
- `phones(count, options?)` opens `count` phones, each in its own context at `/`. Each phone has its own storage and socket. WebKit runs emulate an iPhone 15 and Chromium runs a Pixel 7. Every context closes when the test ends.
- `src/flows.ts` has the shared steps: `openRoom` types the passcode and returns the room code, `joinRoom` types a code and name, and `trackRelaySockets` counts a page's open `/ws/` sockets.

## Motion sensors

Playwright can't emulate motion sensors, so phones use the fake sensor adapter instead ([motion.md](../docs/architecture/motion.md#sensor-adapter), rule 7). The hook is the global `window.__couchcadeMotion`.

1. **The test sets it** before the page loads. `phones(1, { motion: { permission: "granted" } })` calls `injectFakeMotion` from `src/motion.ts`, which adds it with `addInitScript`, so every load of that phone has it before the controller's scripts run. `permission` is `granted`, `denied` or `unsupported`.
2. **The controller reads it** in dev and test builds only. `apps/controller/src/motion/adapter.ts` (CC-5.10) checks for the global. When it is there, the module creates `createFakeAdapter()` from `@couchcade/motion` instead of the browser adapter, calls `setPermission(permission)`, and stores the fake on `window.__couchcadeMotion.adapter`. Production builds never read the global.
3. **The test drives the fake** with `pushMotionSample(phone, sample)` or `playMotionTrace(phone, trace, { speed })`. Both wait until the controller has stored the adapter. Samples and traces use the formats in motion.md, and synthetic traces come from `@couchcade/motion/sensors`.

`platform/motion-hook.spec.ts` checks the harness half: the hook is present from the first script on, after a reload too, and only on phones that asked for it.

## CI

`.github/workflows/e2e.yml` runs `pnpm e2e` on every pull request. It caches the pnpm store and the Playwright browsers, which are keyed on the Playwright version from the pnpm catalog. Traces are kept only for failed tests and uploaded only when the job fails, for 7 days. Open one with `pnpm --filter ./e2e exec playwright show-trace <trace.zip>`.
