# Tech stack and hosting 🧾

Couchcade must cost €0 to build and run. This document records what was checked, what was chosen, and what the spikes in epic CC-1 still have to prove.

Research date: 16 September 2026, against official docs and pricing pages. Sources are at the bottom. Free tiers change, so check them again before relying on a number.

---

## Contents

- [Constraints](#constraints)
- [Decisions](#decisions)
- [Hosting](#hosting)
- [Libraries](#libraries)
- [Toolchain](#toolchain)
- [CI/CD and repository services](#cicd-and-repository-services)
- [Open questions for the CC-1 spikes](#open-questions-for-the-cc-1-spikes)
- [Sources](#sources)

---

## Constraints

- **€0.** No paid plans, no credit card on file, no usage-based billing.
- **Low traffic.** The site may sleep when idle, or refuse service for the rest of the day when a free limit is reached.
- **Public repository** on a free personal GitHub account.
- **Small groups.** Usually 2–4 players, sometimes more; rooms hold up to 8.
- **Mixed phones.** iPhone (Safari) and Android (Chrome), so everything must work in WebKit and Chromium.
- **Big screen.** A laptop browser runs the host, shown on the TV over HDMI or cast to a Chromecast. Both add display lag, which timing games calibrate for.
- **English only.** No translation layer.

---

## Decisions

| Area | Decision | Cost |
|---|---|---|
| Relay and API | Cloudflare Workers Free + SQLite-backed Durable Objects | €0, no card |
| Rooms and sockets | partyserver on the Durable Object, partysocket on host and phones | €0, open source |
| Touch joystick | nipplejs | €0, MIT |
| Physics | Planck.js | €0, MIT |
| Joining | QR code with a 4-letter room code fallback; a host passcode to create rooms, open joining | €0 |
| Host and controller apps | Workers Static Assets, served by the same Worker | €0, asset requests are unlimited |
| Bot protection | Turnstile + Workers Rate Limiting binding | €0 |
| Domain | `couchcade.<account>.workers.dev` | €0 (a custom domain means paying for a registration) |
| Toolchain | pnpm workspaces, Vite 8, Vitest 4.1, Oxlint, Oxfmt, `vue-tsc` | €0, all open source |
| Vite+ | Postponed until 1.0 | Free (MIT); postponed for maturity, not cost |
| Testing | Unit tests for game and platform logic, one bot-plays-a-match E2E test per game, no coverage thresholds | €0 |
| Game assets | Original, or CC0 packs recoloured to the palettes and credited in the game's `CREDITS.md` | €0 |
| CI/CD | GitHub Actions; deploy with `cloudflare/wrangler-action` on push to `main` | €0 on a public repository |
| Dependency updates | Renovate (Mend Community Cloud) | €0 |
| Monitoring | Workers Logs (sampled) + a scheduled smoke test in Actions | €0 |

---

## Hosting

### Why Cloudflare

Cloudflare is the only option checked that gives all of these at once:

- WebSockets with state per room (one Durable Object per room)
- No credit card and no way to be billed
- Rooms placed in the EU
- Static hosting in the same deploy, on the same origin

When a free limit is reached, requests of that type fail until the daily reset at 00:00 UTC. Nothing is charged.

### Alternatives checked

| Option | Why not |
|---|---|
| **Vercel Hobby** | WebSockets on Functions have been in public beta since June 2026, but Hobby functions stop after 300 seconds, so every socket drops at least every 5 minutes. Players in one room can land on different instances, so rooms need Redis to share messages, and the free Upstash tier covers about an hour of play per month. Hobby is non-commercial only. |
| Vercel for static, relay elsewhere | Adds a second deploy, CORS and cross-origin tickets, with no latency gain. |
| Netlify | No WebSockets in functions. |
| Deno Deploy | Usable free tier, but instances share no memory, so a room can split across instances without an external message bus. |
| **Render free** | One instance, so in-memory rooms work. It sleeps after 15 minutes idle, takes about a minute to wake, and can restart at any time. **This is the fallback** if the Cloudflare limits don't hold. |
| Fly.io, Railway, Koyeb, Northflank, Google Cloud Run, AWS | No lasting free tier, or a credit card is required. |
| Ably, Pusher, Supabase Realtime, PubNub, Liveblocks, Azure Web PubSub | Free message quotas last between minutes and a few hours of play per month. Pusher caps client events at 10/s, and Supabase caps at 100 msg/s and pauses idle projects. |
| Peer-to-peer WebRTC | Phones on 4G often need a TURN server, and free TURN is limited. A later option for gameplay traffic, with the Durable Object kept for signalling and fallback. |

### Verified free limits

| Resource | Free limit | Why it matters |
|---|---|---|
| Durable Object requests | 100,000 / day | **The limit Couchcade hits first.** Every WebSocket connection and every incoming message counts. |
| Durable Object duration | 13,000 GB-s / day (about 28 room-hours if never hibernated) | Hibernated and idle objects aren't billed. |
| Durable Object SQLite | 5M rows read and 100,000 rows written per day, 5 GB total | One snapshot per round is negligible. |
| Worker requests | 100,000 / day | Only HTTP requests and WebSocket upgrades count. Static asset requests and messages on an open socket don't. |
| Worker CPU time | 10 ms per request | Ticket signing, Turnstile checks and schema validation must stay cheap. |
| Outgoing WebSocket messages | Free | The relay forwarding to phones costs nothing. |
| Rate Limiting binding | Periods of 10 s or 60 s | Counts are per Cloudflare location and eventually consistent: fine for abuse control, not exact quotas. |
| Turnstile | Unlimited challenges, 20 widgets | |
| Static assets | 20,000 files, 25 MiB per file | |
| Workers Logs | 200,000 events / day, kept 3 days | Every Durable Object message can create a log event. |
| `serializeAttachment()` | 16 KB per socket | Enough for player id, role and room code. |

### The request budget

On paid plans, 20 incoming WebSocket messages count as one Durable Object request. Cloudflare doesn't say whether the free 100,000/day uses the same ratio. That single fact decides how much play fits in a day.

One room, a 2-hour game night, 8 phones:

| Scenario | Incoming messages | If 20:1 applies | If it doesn't |
|---|---|---|---|
| Worst case: every phone at 15 msg/s for 2 hours | ~972,000 | ~48,600 requests: about 2 nights a day | Over the limit after ~12 minutes |
| Typical: 30% real-time, the rest turn-based | ~302,000 | ~15,100 requests: about 6 nights a day | Over the limit during the first night |

If the ratio doesn't apply on Free, phones batch input to at most 5 messages per second. If that still isn't enough, gameplay messages move to WebRTC data channels, and the Durable Object handles only signalling.

### Design rules that follow

1. Phones send input only when it changes, batched to at most 15 messages per second.
2. The host sends one batched `controller:state` per tick for all phones. Messages from the host to the relay count; messages from the relay to phones don't.
3. Keep-alive pings are answered with `setWebSocketAutoResponse()`, which doesn't wake the Durable Object. The `ping`/`pong` round-trip messages only run while the dev overlay is open.
4. Sockets are accepted with `ctx.acceptWebSocket()` (Hibernation API), never `ws.accept()`.
5. No `setTimeout` or `setInterval` inside the Durable Object; they prevent hibernation. Room expiry uses alarms.
6. Player data lives in `ws.serializeAttachment()`.
7. Tickets, Turnstile, `Origin` and rate limits are checked in the Worker, before the Durable Object is called.
8. Rooms are created with `locationHint: "weur"`, so the first request doesn't place a room far from EU players.
9. Every deploy disconnects every socket. Host and phones reconnect automatically and the room restores from its last snapshot.
10. Logs use a low `observability.head_sampling_rate`, so the 200,000 daily events last all day.

---

## Libraries

Chosen during planning on 16 September 2026. Versions and licences checked on npm the same day.

| Library | Version | Licence | Used for |
|---|---|---|---|
| partyserver | 0.5.x | ISC | The Room Durable Object: rooms, connections and broadcasting on top of the Hibernation API |
| partysocket | 1.x | MIT | Reconnecting WebSocket client on the host and on phones |
| nipplejs | 1.x | MIT | The virtual joystick in `@couchcade/ui` |
| Planck.js (`planck`) | 1.x | MIT | 2D physics in `@couchcade/physics`, stepped at a fixed rate so matches are deterministic |

### Why our own platform

The platform is our own, on Cloudflare Workers Free, reusing these libraries for the parts that are easy to get wrong (rooms, reconnects, touch input, physics). Alternatives checked:

| Option | Why not |
|---|---|
| AirConsole | Free tier is 2 players with ads, the SDK is all rights reserved, and games run inside their iframe. |
| Playroom Kit | Closed source, 10 users a day on the free tier, no motion API. |
| Rune | No shared TV screen, 4 players at most. |
| Colyseus | Needs a second, Node-based host outside the €0 Cloudflare plan. |
| Everything from scratch | More code to get right for rooms and reconnects than partyserver and partysocket already handle. |

---

## Toolchain

Every tool below is free and open source.

| Tool | Version | Notes |
|---|---|---|
| pnpm | 12.x, pinned with `packageManager` | Catalogs and `minimumReleaseAge` (1 day by default). Unknown keys in `pnpm-workspace.yaml` fail the install. |
| Vite | 8.x | Rolldown is the only bundler. |
| Vitest | **4.1.x, pinned** | Vitest 5 came out on 3 September 2026, but `@cloudflare/vitest-plugin` doesn't support it yet. Renovate holds it back. |
| `@cloudflare/vite-plugin` | 1.x | Runs the Worker in `workerd` during development. |
| `@cloudflare/vitest-plugin` | 1.x | Replaces `@cloudflare/vitest-pool-workers`. Durable Object WebSocket tests need `--max-workers=1 --no-isolate`. |
| TypeScript | 6.x, strict | `vue-tsc` doesn't run on TypeScript 7 until 7.1 ships a stable API. |
| Oxlint | 1.x | Lint rules in the root `.oxlintrc.json`. |
| Oxfmt | Beta | Formats TypeScript and Vue files. |
| Vue | 3.5 | Vapor mode waits for a stable 3.6. |
| Phaser | 4.x | The npm build isn't tree-shakeable. A core-only build from the source entry is about 205 KB gzip (estimate). |
| Zod | 4, `zod/mini` on the phone | About 2–4 KB gzip for small schemas. |
| Playwright | 1.63 | Chromium and WebKit on Linux runners. |
| fast-check, axe-core, size-limit, dependency-cruiser | Current | All maintained. |
| Lighthouse CI | 0.15 | No release in 15 months. Assert only, so it's easy to drop. |
| Turborepo | Not yet | Add for its local cache only when CI time becomes a problem. |

Both size budgets in the README are realistic. The phone controller should land around 35–50 KB gzip against 80 KB. Phaser takes 205–350 KB gzip of the host's 450 KB, depending on the build.

### Why not Vite+ yet

Vite+ is MIT and free for everyone, so cost isn't the issue. Maturity is:

- It's in beta (0.3.x), and each of its last three minor releases had breaking changes.
- Two open cache bugs can make CI pass without running anything ([#2636](https://github.com/voidzero-dev/vite-plus/issues/2636), [#2635](https://github.com/voidzero-dev/vite-plus/issues/2635)).
- It pins Vitest 4.1.11 exactly.
- Its dev server can hang when used with the Cloudflare Vite plugin ([#2481](https://github.com/voidzero-dev/vite-plus/issues/2481)).

Revisit at 1.0 once those issues are closed. All config stays plain Vite, Vitest and Oxc, so `vp migrate` should be cheap later.

| The plan said | Now |
|---|---|
| `vp run dev` | `pnpm dev` |
| `vp check` | `pnpm check` (Oxfmt check, Oxlint, `vue-tsc`) |
| `vp run test` | `pnpm test` |
| `vp run build` | `pnpm build` |
| `pnpm deploy` | `pnpm run deploy` (`pnpm deploy` is a built-in pnpm command and would not run the script) |
| Lint config in `vite.config.ts` | `.oxlintrc.json` and `.oxfmtrc.json` at the root |

### Lint gaps

- **`v-html`:** Oxlint doesn't read Vue templates, so it can't ban `v-html`. `pnpm check:style` fails on it instead.
- **`Math.random()` and `Date.now()` in `shared/`:** banned with `no-restricted-properties` in an Oxlint override. That rule misses `new Date()`, so `check:style` catches that too.

### Fonts

Fredoka and Pixelify Sans use the SIL Open Font License 1.1, with no reserved font names. Self-hosting subsetted WOFF2 files is allowed. Ship `OFL.txt` next to the font files.

---

## CI/CD and repository services

Everything here is free for a public repository on GitHub Free:

| Service | Limit |
|---|---|
| GitHub Actions, standard runners | Unlimited minutes; 20 concurrent jobs; 6 hours per job |
| Actions cache | 10 GB per repository |
| Actions artifacts | Treat 500 MB as a hard cap |
| CodeQL (default setup) | Free |
| Branch protection and rulesets | Free |
| Private vulnerability reporting | Free |
| Dependabot alerts | Free (SHA-pinned actions aren't covered; Renovate updates those digests) |
| Renovate | Free (1 job at a time, runs about every 4 hours) |

### What this changes in CI

1. **No PR preview deploys.** Cloudflare doesn't create preview URLs for Workers that contain a Durable Object. Pull request E2E tests run against the local dev server in CI.
2. **Deploy from Actions, not Workers Builds.** Actions can deploy only after every check passes and then run the smoke test. The first deploy is done by hand; after that, the CI token only gets the Workers `Editor` role on this one Worker, with `account_id` set in `wrangler.jsonc`.
3. **Fork PRs get no secrets.** Nothing in the pull request pipeline needs Cloudflare credentials.
4. **A lean test bar.** CI runs unit tests and one bot-plays-a-match E2E test per game. There are no coverage thresholds and no visual regression suite.
5. **Artifacts only on failure.** Playwright traces and Lighthouse reports are uploaded when a job fails, kept for 7 days.
6. **Motion sensors can't be emulated.** Playwright has no accelerometer or gyroscope support, so `@couchcade/motion` reads sensors through an adapter that tests replace with recorded traces.
7. **Scheduled workflows expire.** GitHub disables a cron smoke test after 60 days without repository activity.

### Monitoring

No Sentry: it's a third-party script that sends error and IP data, which breaks the "no analytics scripts" promise. Workers Logs (3-day retention, sampled) and the smoke test after each deploy are enough for now.

---

## Open questions for the CC-1 spikes

| Question | How to settle it | Story |
|---|---|---|
| Does the 20:1 message ratio apply on the Free plan? | Deploy a test Worker, send a known number of messages, read the Durable Object request count in the dashboard. | CC-1.4 |
| Does the Rate Limiting binding work on Free? | The docs show no plan restriction but don't name Free. Check it in the same deploy. | CC-1.4 |
| Do Durable Object message handlers get 10 ms or 30 s of CPU on Free? | Undocumented. Keep the relay handler trivial so it doesn't matter. | None needed |
| Do app WebSockets work through the Cloudflare Vite plugin dev server? | An open issue ([workers-sdk#15654](https://github.com/cloudflare/workers-sdk/issues/15654)) reports the dev server closing non-Vite sockets. A throwaway prototype exchanges messages between a host page and a phone page over the local dev server. Fallback: run `wrangler dev` separately behind a Vite proxy. | CC-1.3 |
| Is the median EU round trip under 120 ms? | Measure with the dev overlay after the first deploy. | After CC-1.18 |

---

## Sources

**Cloudflare**
- Durable Objects pricing: https://developers.cloudflare.com/durable-objects/platform/pricing/
- Durable Objects limits: https://developers.cloudflare.com/durable-objects/platform/limits/
- Durable Objects free tier announcement: https://developers.cloudflare.com/changelog/post/2025-04-07-durable-objects-free-tier/
- WebSocket Hibernation: https://developers.cloudflare.com/durable-objects/best-practices/websockets/
- Durable Object lifecycle: https://developers.cloudflare.com/durable-objects/concepts/durable-object-lifecycle/
- Data location: https://developers.cloudflare.com/durable-objects/reference/data-location/
- Workers pricing: https://developers.cloudflare.com/workers/platform/pricing/
- Workers limits: https://developers.cloudflare.com/workers/platform/limits/
- Static assets billing: https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/
- Rate Limiting binding: https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/
- Turnstile plans: https://developers.cloudflare.com/turnstile/plans/
- Turnstile testing: https://developers.cloudflare.com/turnstile/troubleshooting/testing/
- workers.dev: https://developers.cloudflare.com/workers/configuration/routing/workers-dev/
- Workers Logs: https://developers.cloudflare.com/workers/observability/logs/workers-logs/
- Preview URLs: https://developers.cloudflare.com/workers/configuration/previews/
- Vitest integration: https://developers.cloudflare.com/workers/testing/vitest-integration/
- Workers Builds limits: https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/
- Workers authorization roles: https://developers.cloudflare.com/workers/authorization/workers/

**Alternatives**
- Vercel WebSockets: https://vercel.com/docs/functions/websockets
- Vercel Functions limits: https://vercel.com/docs/functions/limitations
- Vercel Hobby plan: https://vercel.com/docs/plans/hobby
- Deno Deploy pricing: https://deno.com/deploy/pricing
- Render free tier: https://render.com/docs/free
- Fly.io pricing: https://fly.io/docs/about/pricing/
- Ably limits: https://ably.com/docs/platform/pricing/limits
- Pusher pricing: https://pusher.com/channels/pricing/
- Supabase Realtime limits: https://supabase.com/docs/guides/realtime/limits

**Libraries**
- partyserver and partysocket: https://github.com/cloudflare/partykit
- nipplejs: https://github.com/yoannmoinet/nipplejs
- Planck.js: https://github.com/piqnt/planck.js

**Toolchain**
- Vite+ beta: https://voidzero.dev/posts/announcing-vite-plus-beta
- Vite 8: https://vite.dev/blog/announcing-vite8
- Vitest 5: https://vitest.dev/blog/vitest-5.html
- Vitest visual regression: https://vitest.dev/guide/browser/visual-regression-testing
- Oxlint type-aware linting: https://oxc.rs/blog/2026-07-22-type-aware-linting-stable
- Oxfmt beta: https://oxc.rs/blog/2026-02-24-oxfmt-beta
- `vue-tsc` and TypeScript 7: https://github.com/vuejs/language-tools/discussions/6121
- pnpm 12: https://pnpm.io/blog/releases/12.0
- Zod mini: https://zod.dev/packages/mini
- Lighthouse CI configuration: https://github.com/GoogleChrome/lighthouse-ci/blob/main/docs/configuration.md

**GitHub and CI**
- Actions billing: https://docs.github.com/en/billing/concepts/product-billing/github-actions
- Actions limits: https://docs.github.com/en/actions/reference/limits
- CodeQL default setup: https://docs.github.com/en/code-security/code-scanning/enabling-code-scanning/configuring-default-setup-for-code-scanning
- Renovate Mend-hosted apps: https://docs.renovatebot.com/mend-hosted/overview/
- Playwright visual comparisons: https://playwright.dev/docs/test-snapshots
- Playwright in Docker: https://playwright.dev/docs/docker
