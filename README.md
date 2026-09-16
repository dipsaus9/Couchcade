# Couchcade 🕹️

**Your phone is the controller. The TV is the arcade.**

Couchcade is a browser-based party game platform. One shared screen runs the game, everyone joins on their phone with a four-letter room code, and nobody installs anything. The games are original, short and physical, inspired by Wii Sports and retro arcade classics.

---

## Contents

- [How it works](#how-it-works)
- [Games](#games)
- [Tech stack](#tech-stack)
- [Repository structure](#repository-structure)
- [Getting started](#getting-started)
- [Scripts](#scripts)
- [Architecture rules](#architecture-rules)
- [Creating a game](#creating-a-game)
- [Testing](#testing)
- [Security](#security)
- [Performance budgets](#performance-budgets)
- [Hosting and free-tier limits](#hosting-and-free-tier-limits)
- [House style](#house-style)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)

---

## How it works

Both the host screen and every phone connect **outward** to a Cloudflare Worker over WebSockets. Each room is its own Durable Object, which relays messages between the host and the phones. This works on any network, including phones on 4G while the TV is on Wi-Fi.

```
   ┌──────────────┐                                        ┌──────────────┐
   │  HOST SCREEN │                                        │   PHONE (P1) │
   │  (TV/laptop) │◄──── WebSocket ────┐    ┌───────────── │  controller  │
   │  runs game   │                    │    │              └──────────────┘
   └──────────────┘            ┌───────┴────┴───────┐      ┌──────────────┐
                               │  CLOUDFLARE WORKER │◄─────│   PHONE (P2) │
                               │  └─ Durable Object │      └──────────────┘
                               │     room "KZPW"    │      ┌──────────────┐
                               └────────────────────┘◄─────│   PHONE (P3) │
                                                           └──────────────┘
```

- **The host is authoritative.** All game logic and physics run in the host browser. The relay knows about rooms, players and connections, never about game rules.
- **Phones are thin controllers.** The host tells each phone what to show; the phone sends back input events.
- **Events, not streams.** Phones process sensor data locally and send one message per action, such as `throw { speed, angle, spin }`.

### Join flow

1. The host clicks **Host a game**. An invisible Turnstile check runs, and `POST /api/rooms` returns a room code and a signed join ticket.
2. The host connects to `wss://<domain>/ws/<code>?ticket=<ticket>`.
3. A player opens the site, enters the code and a name, passes Turnstile, receives a ticket and connects.
4. The relay issues a reconnect token (stored in `sessionStorage`) so a phone that locks its screen rejoins as the same player.
5. The first player is the **VIP** and can start the game. The host can kick players and lock the room.
6. Rooms hold up to 8 players. Extra joiners become audience.

### Messages

All messages are defined in `@couchcade/protocol`, validated on both ends and capped at 1 KB.

| Direction | Message | Purpose |
|---|---|---|
| relay → host | `player:joined`, `player:left`, `player:reconnected` | Lobby and presence |
| phone → host | `input { type, payload }` | Game input |
| host → phone(s) | `controller:state { screen, data }` | What the phone shows |
| host → relay | `room:kick`, `room:lock` | Moderation |
| host → relay | `room:snapshot` | State backup at the end of each round |
| both | `ping`, `pong` | Round-trip time for the dev overlay |

---

## Games

| Game | Inspiration | Phone input | Status |
|---|---|---|---|
| **Quick Draw** | Western reaction duel | Tap the moment the TV says draw; early is a foul | MVP |
| **Pixel Derby** | Track & Field button mashing | Tap fast, manage your stamina | MVP |
| **Strike Night** | Bowling | Hold, swing your phone, release; twist for spin | MVP |
| **Bumper Sumo** | Arena brawlers | Tilt to steer, shake to dash | Planned |
| **Duck Season** | Light-gun shooters | Point your phone at the TV, tap to shoot | Planned |
| **Paddle Panic** | Four-sided Pong | Tilt or drag your paddle | Planned |
| **Bandeja** | Tennis and padel | Swing timing, forehand or backhand | Planned |

Every motion control has a touch fallback. All names, art and sounds are original.

---

## Tech stack

| Concern | Choice |
|---|---|
| Package manager and task runner | pnpm workspaces with catalogs (`pnpm -r`, `--filter`) |
| Build | Vite 8 (Rolldown) |
| Lint and format | Oxlint, Oxfmt |
| Language | TypeScript 6 (strict), `vue-tsc` |
| Host rendering | Phaser 4 (custom build) |
| Controller UI | Vue 3.5 |
| Relay and API | Cloudflare Workers + Durable Objects (SQLite-backed, WebSocket Hibernation API) |
| Local Worker runtime | `@cloudflare/vite-plugin` (runs `workerd`) |
| Validation | Zod 4 (`zod/mini` on the phone) |
| Bot protection | Cloudflare Turnstile + Workers Rate Limiting binding |
| Testing | Vitest 4.1 (unit, browser mode, visual), `@cloudflare/vitest-plugin`, Playwright, fast-check, axe-core |
| Budgets | size-limit, Lighthouse CI |
| Import boundaries | dependency-cruiser |
| CI/CD | GitHub Actions + Wrangler |

> Every choice is free. See [`docs/TECH_STACK.md`](docs/TECH_STACK.md) for the research behind it, the alternatives that were rejected, and the open questions for Phase 0. Vite+ is postponed until 1.0; the configs stay plain Vite, Vitest and Oxc so a later move is cheap.

---

## Repository structure

```
couchcade/
├── apps/
│   ├── host/                  # Big-screen app: Vite + Phaser
│   ├── controller/            # Phone app: Vue 3 + Vite
│   └── server/                # Cloudflare Worker: API, relay, headers, static assets
│       ├── src/worker.ts
│       ├── src/room.ts        # Durable Object, one per room
│       ├── src/security/      # tickets, turnstile, rate limits, headers, names
│       └── wrangler.jsonc
├── games/
│   ├── quick-draw/            # @couchcade/game-quick-draw
│   │   ├── src/host/          # Phaser scene (extends StageScene)
│   │   ├── src/controller/    # Vue components (built from @couchcade/ui)
│   │   ├── src/shared/        # Rules, scoring, messages: pure functions
│   │   ├── src/index.ts       # Exports the CouchcadeGame definition
│   │   └── test/              # Rules, contract, replays, visuals
│   ├── pixel-derby/
│   └── strike-night/
├── packages/
│   ├── theme/                 # House style tokens → CSS variables + Phaser colours
│   ├── ui/                    # Vue components: buttons, panels, chips, Pips
│   ├── stage/                 # Phaser components: scoreboard, callouts, World Pips, transitions
│   ├── protocol/              # Message schemas and types
│   ├── game-sdk/              # Game contract, lifecycle, input throttling, registry
│   │   └── testing/           # testGameContract(), fake room, input replayer
│   ├── utils/                 # Pure helpers: room codes, math, easing, seeded RNG, timing
│   ├── motion/                # Sensor permissions, calibration, gesture detection
│   └── config/                # Shared tsconfig bases and Vite/Vitest presets
├── e2e/                       # Playwright multi-device tests
├── tooling/                   # check-style, budgets, sensor trace recorder
├── docs/
│   ├── HOUSE_STYLE.md         # Visual and interaction guidelines
│   └── TECH_STACK.md          # Stack, hosting and free-tier research
├── pnpm-workspace.yaml        # Workspace globs + dependency catalog
├── .oxlintrc.json             # Root lint rules
├── .oxfmtrc.json              # Root format rules
└── package.json               # Root scripts
```

---

## Getting started

### Requirements

- Node.js (current LTS)
- pnpm (the version pinned in `packageManager`)
- A free Cloudflare account (only needed to deploy; no credit card)

### Install and run

```bash
git clone https://github.com/dipsaus9/Couchcade.git
cd Couchcade
pnpm install
cp apps/server/.dev.vars.example apps/server/.dev.vars
pnpm dev
```

This starts the Worker (API, relay and static assets) in the local `workerd` runtime, plus the host and controller dev servers.

- Host: open `/host` on your laptop
- Controller: open the root URL on your phone (same network, or use the dev tunnel below)

### Local secrets

`apps/server/.dev.vars`:

```bash
# Cloudflare's Turnstile test secret that always passes
TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
# Any long random string for local development
TICKET_SIGNING_SECRET=change-me-to-a-long-random-string
```

The controller and host use the matching Turnstile test site key in development, so no real challenges are shown locally.

### Testing on a real phone

Phones need HTTPS for motion sensors. Use a Cloudflare quick tunnel:

```bash
npx cloudflared tunnel --url http://localhost:5173
```

Open the generated `https://…trycloudflare.com` URL on your phone.

---

## Scripts

Every package exposes the same script names, so root commands run across the whole repository with `pnpm -r`.

| Command | What it does |
|---|---|
| `pnpm dev` | Starts server, host and controller |
| `pnpm check` | Checks formatting, lints and type-checks |
| `pnpm test` | Runs unit and integration tests with coverage thresholds |
| `pnpm e2e` | Runs Playwright E2E, game scene and visual tests |
| `pnpm check:style` | Fails on colours or fonts outside `@couchcade/theme`, off-palette sprites, `v-html` and `new Date()` in `shared/` |
| `pnpm check:deps` | Enforces import boundaries |
| `pnpm budgets` | Runs size-limit and Lighthouse CI |
| `pnpm build` | Builds everything |
| `pnpm run deploy` | Builds and deploys the Worker with Wrangler (`pnpm deploy` is a built-in pnpm command, so use `run`) |

---

## Architecture rules

### Dependency direction

```
apps  ──►  games  ──►  stage / ui / game-sdk / motion  ──►  theme / protocol  ──►  utils
```

- Arrows only point right. `utils` depends on nothing, and nothing imports from `apps`.
- Games never import from other games. Anything two games need moves into a package.
- dependency-cruiser enforces this in CI.

### Shared configuration

- TypeScript: every package extends a base from `packages/config/tsconfig/` (`base`, `vue`, `worker`, `lib`).
- Vite and Vitest: every package uses a preset from `packages/config/vite/` (`defineAppConfig`, `defineLibConfig`, `defineWorkerConfig`, `defineTestConfig`).
- Lint and format rules live only in the root `.oxlintrc.json` and `.oxfmtrc.json`.
- Dependency versions live only in the `pnpm-workspace.yaml` catalog. Packages reference them with `"catalog:"`.

### Internal packages

- Internal packages point `exports` at their TypeScript source. There are no build steps or `dist` folders for internal code.
- Naming: `@couchcade/<name>` for packages, `@couchcade/game-<name>` for games.

### Deterministic game logic

- Game rules in `src/shared/` are pure functions.
- Randomness comes from the seeded RNG in `@couchcade/utils`.
- Time comes in as `dtMs` on a fixed timestep.
- `Math.random()` and `Date.now()` are banned by lint inside `shared/`, and `new Date()` by `check:style`.

---

## Creating a game

1. Scaffold a new package in `games/<name>` (copy `games/quick-draw` as a template).
2. Implement the contract:

```ts
export interface CouchcadeGame<TInput, TState> {
  id: string;
  title: string;
  players: { min: number; max: number };
  realtime: boolean;                          // enables throttled input stream
  needsMotion: boolean;                       // adds a motion permission step to the lobby
  scene: ScenePaletteId;                      // 'desert' | 'alley' | 'track' | …
  inputSchema: Schema<TInput>;
  init(players: Player[], seed: number): TState;
  onPlayerInput(state: TState, player: Player, input: TInput): TState;   // pure
  onTick?(state: TState, dtMs: number): TState;                          // pure, fixed step
  hostScene: () => Promise<SceneClass>;       // extends StageScene
  controller: () => Promise<Component>;       // built from @couchcade/ui
}
```

3. Register the game in the host's game registry.
4. Before merging, the game must have:
   - Unit and property tests for its rules
   - A passing `testGameContract(game)` suite
   - At least three recorded replays
   - A Playwright scene test where a bot plays a full match
   - A touch fallback for every motion input
   - A house style review against [`docs/HOUSE_STYLE.md`](docs/HOUSE_STYLE.md)

---

## Testing

Every package and game has tests, and coverage thresholds are enforced per package.

| Area | Test types | Tools | Coverage |
|---|---|---|---|
| `utils` | Unit, property-based | Vitest, fast-check | 95% |
| `protocol` | Valid and invalid fixtures per message, size cap, round-trips | Vitest | All message types |
| `theme` | Token snapshots, WCAG AA contrast checks, generated output | Vitest | 95% |
| `game-sdk` | Lifecycle, throttling, registry, testing helpers | Vitest | 90% |
| `motion` | Recorded sensor traces from real phones replayed through gesture detection | Vitest | 90% |
| `ui` | Component interaction, accessibility, visual regression | Vitest browser mode, axe-core | 85% |
| `stage` | Visual snapshots at fixed seed | Playwright | All components |
| `apps/server` | Room lifecycle, hibernation, reconnects, cleanup, security rules | `@cloudflare/vitest-plugin` | 90% |
| Game rules | Unit and property tests | Vitest, fast-check | 90% |
| Game contract | `testGameContract(game)` | game-sdk/testing | Required |
| Game replays | Input logs replayed to an exact final state | game-sdk/testing | 3+ per game |
| Game scenes | Headless boot, bot plays a full match, FPS sampled | Playwright | Required |
| E2E | Host + 4 phones: create, join, play, disconnect, rejoin, play again, leave | Playwright (Chromium + WebKit) | Critical paths |

### Recording sensor traces

```bash
pnpm trace:record
```

Opens a recorder page on your phone. Perform a gesture, label it, and the trace is saved as a JSON fixture in `packages/motion/test/traces/`.

Playwright can't emulate motion sensors, so `@couchcade/motion` reads sensors through an adapter that tests replace with recorded traces.

### CI pipeline

```
Pull request
 ├─ check                         lint, format, types
 ├─ check:style + check:deps      house style and import boundaries
 ├─ test                          unit + integration + coverage thresholds
 ├─ e2e                           E2E + game scenes + visual regression, against the local Worker
 ├─ budgets                       size-limit + Lighthouse CI (assert only)
 └─ security                      pnpm audit + CodeQL
Merge to main
 └─ deploy                        wrangler deploy → smoke test on the live URL
```

- There are no preview deploys: Cloudflare doesn't create preview URLs for Workers with Durable Objects.
- Visual baselines are generated in the pinned Playwright Docker image, never on a Mac.
- Traces and reports are uploaded only when a job fails, and kept for 7 days.

---

## Security

Couchcade has no accounts, no chat, no email forms and no stored user content, so there is very little to abuse. Every entry point is still protected.

| Threat | Defence |
|---|---|
| Bots creating rooms | Turnstile on **Host a game**, 3 rooms per IP per minute, 1 active room per host session |
| Guessing room codes | Turnstile on join, 10 join attempts per IP per minute, codes only valid while the host is connected, interactive challenge after 3 wrong codes |
| Direct WebSocket connections | Signed HMAC ticket required (60-second expiry, bound to room and role); `Origin` must match |
| Message flooding | Per-socket token bucket (20/s, burst 40); violators are disconnected and their reconnect token is revoked |
| Malformed or oversized messages | 1 KB cap and schema validation; invalid messages are dropped |
| Offensive or malicious names | 1–12 characters, NFKC normalisation, character allowlist, NL + EN blocklist, host can kick |
| XSS | All user text rendered as text, `v-html` banned by `check:style`, strict CSP |
| Supply chain | pnpm `minimumReleaseAge`, frozen lockfile, Renovate, `pnpm audit`, CodeQL, Actions pinned to SHAs |
| Leaked deploy credentials | Scoped Cloudflare API token stored as a GitHub secret, branch protection on `main` |

Invalid tickets, bad origins and rate-limited requests are rejected in the Worker before a Durable Object is invoked.

### Security headers

```
Content-Security-Policy: default-src 'self'; script-src 'self' https://challenges.cloudflare.com;
  frame-src https://challenges.cloudflare.com; connect-src 'self'; img-src 'self' data:;
  style-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
Cross-Origin-Opener-Policy: same-origin
Permissions-Policy: accelerometer=(self), gyroscope=(self), camera=(), microphone=(), geolocation=()
```

### Privacy

- No cookies, no analytics scripts, no cookie banner.
- IP addresses are only used in memory as rate-limit keys and are never stored.
- Room data is deleted when the room ends.

### Production secrets

```bash
cd apps/server
npx wrangler secret put TURNSTILE_SECRET_KEY
npx wrangler secret put TICKET_SIGNING_SECRET
```

### Reporting a vulnerability

Please don't open a public issue. Use GitHub's private vulnerability reporting on this repository.

---

## Performance budgets

A pull request that breaks a budget fails CI.

### Phone controller

| Metric | Budget |
|---|---|
| Initial JS (gzip) | ≤ 80 KB |
| Per-game controller chunk (gzip) | ≤ 25 KB |
| Fonts (2 subsetted WOFF2 files) | ≤ 40 KB |
| Lighthouse performance (mobile, 4G) | ≥ 95 |
| Largest Contentful Paint | < 1.5s |
| Interaction to Next Paint | < 100ms |
| Tap to message sent | < 16ms |

### Host

| Metric | Budget |
|---|---|
| Frame rate | Stable 60fps at 1080p on a 5-year-old laptop |
| Platform JS (gzip, incl. Phaser) | ≤ 450 KB |
| Assets per game | ≤ 1.5 MB |
| Game load time | < 2s |
| Allocations in the update loop | None (use object pools from `stage`) |

### Network

| Metric | Budget |
|---|---|
| Message size | ≤ 1 KB (typically < 100 bytes) |
| Median RTT in the EU | < 120ms |
| Real-time input rate | ≤ 15 messages/sec per phone, sent only when input changes |

---

## Hosting and free-tier limits

Couchcade runs entirely on the Cloudflare Workers Free plan and costs €0. No credit card is needed. When a free limit is reached, requests fail until the daily reset at 00:00 UTC; there are no charges.

| Resource | Free limit | Notes |
|---|---|---|
| Durable Object requests | 100,000 / day | **The limit we hit first.** Every connection and incoming WebSocket message counts. Paid plans count messages 20:1; whether Free does is undocumented |
| Durable Object duration | 13,000 GB-s / day | Hibernation keeps idle rooms free |
| DO SQLite rows written | 100,000 / day | One snapshot per round |
| Worker requests | 100,000 / day | WebSocket messages don't count, only the upgrade |
| Worker CPU time | 10 ms per request | Keep ticket, Turnstile and schema checks cheap |
| Outgoing WebSocket messages | Free | Relay → phones costs nothing |
| Workers Logs | 200,000 events / day | Sample logs so they last the day |
| Static assets | Unlimited requests | Host and controller apps |
| Turnstile | Unlimited challenges | |

Rules to stay inside the limits:

1. Use the WebSocket Hibernation API (`ctx.acceptWebSocket()`) and store player data with `ws.serializeAttachment()`.
2. Never use `setTimeout` or `setInterval` in a Durable Object; they block hibernation. Use alarms.
3. Reject invalid requests in the Worker, before they reach a Durable Object.
4. Phones send input only when it changes, at most 15 messages per second.
5. The host sends one batched `controller:state` per tick, not one message per phone.
6. Answer keep-alive pings with `setWebSocketAutoResponse()`; the RTT `ping`/`pong` only runs with the dev overlay open.
7. Snapshot per round, never per frame.
8. Delete rooms after 30 minutes idle or 4 hours total.
9. Create rooms with `locationHint: "weur"`.

A 2-hour game night uses roughly 15,000 Durable Object requests if the 20:1 ratio applies on Free, and more than the daily limit if it doesn't. Phase 0 measures this before any game is built. See [`docs/TECH_STACK.md`](docs/TECH_STACK.md#the-request-budget) for the numbers and the fallback.

Limits last verified 16 September 2026. Check the Cloudflare pricing docs before relying on them.

### Deploying

The first deploy is done by hand:

```bash
npx wrangler login
pnpm run deploy
```

After that, merges to `main` deploy through GitHub Actions with a Cloudflare API token that only has the Workers `Editor` role on this Worker. Every deploy disconnects open WebSockets, so the host and phones reconnect automatically.

The site is served from `couchcade.<account>.workers.dev`. A custom domain is optional and would cost a domain registration.

---

## House style

All games, menus and controllers follow one style: **Clubhouse**, a Sunday-morning sports club meets the arcade cabinet. Chunky toy-like interface on top, crisp pixel-art worlds underneath.

Games never draw their own interface. Scoreboards, callouts, menus and avatars come from `@couchcade/stage` and `@couchcade/ui`, and all colours come from `@couchcade/theme`.

See [`docs/HOUSE_STYLE.md`](docs/HOUSE_STYLE.md) for the full guidelines.

---

## Roadmap

- [ ] **Phase 0: Foundations.** Walking skeleton (host + phone over the local dev server), free-tier measurement on a real deploy, monorepo, CI, relay with hibernation, security baseline (Turnstile, tickets, rate limits, headers), first deploy
- [ ] **Phase 1: Platform core + house style.** `theme`, `ui`, `stage`, `protocol`, `game-sdk`, `utils`; lobby with Pips, VIP, kick and lock; reconnects; budgets and visual regression
- [ ] **Phase 2: Quick Draw + Pixel Derby.** Rounds, reaction timing, throttled real-time input, first playtest
- [ ] **Phase 3: Strike Night.** Motion package, sensor traces, physics
- [ ] **Phase 4: Polish and launch.** Music and sound, attract mode, host-refresh recovery, audience mode
- [ ] **Phase 5: Later.** Bumper Sumo, Duck Season, Paddle Panic, Bandeja, tournaments, WebRTC

---

## Contributing

1. Create a branch from `main`.
2. Keep changes inside the right package and follow the dependency direction.
3. Add or update tests; coverage thresholds must pass.
4. Run `pnpm check`, `pnpm test` and `pnpm check:style` locally.
5. Open a pull request. All CI checks must be green before merging.

All names, art and sounds must be original. Don't use assets, names or characters from existing games.

---

## License

The code is released under the [MIT License](LICENSE). The Fredoka and Pixelify Sans fonts keep their own SIL Open Font License 1.1, shipped as `OFL.txt` next to the font files.
