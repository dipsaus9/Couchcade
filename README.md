# Couchcade 🕹️

**Your phone is the controller. The TV is the arcade.**

Couchcade is a browser-based party game platform. One shared screen runs the game, everyone joins on their phone by scanning a QR code, and nobody installs anything. The games are short and physical, inspired by Wii Sports and retro arcade classics but with names of their own.

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

### Who it's for

Design for this setup first:

| | |
|---|---|
| Players | Usually 2–4, sometimes more. Rooms hold up to 8. |
| Phones | A mix of iPhone (Safari) and Android (Chrome). Every feature must work on both. |
| Big screen | A laptop browser running the host, shown on the TV over HDMI or cast to a Chromecast. Timing games calibrate for the display lag. |
| Language | English only. There is no translation layer. |

### Join flow

1. The host opens `/host` and enters the **host passcode**. Only people who know it can create rooms. An invisible Turnstile check runs, and `POST /api/rooms` checks the passcode and returns a room code and a signed host ticket.
2. The host connects to `wss://<domain>/ws/<code>?ticket=<ticket>`. The TV shows a **QR code** for the join URL (`/?room=CODE`) and the **4-letter room code** next to it.
3. A player scans the QR code, which opens the site with the room code already filled in. Players who can't scan open the site and type the 4-letter code instead.
4. The player enters a name, passes Turnstile, receives a player ticket and connects. Joining is open: players need no passcode and no account.
5. The relay issues a reconnect token (stored in `sessionStorage`) so a phone that locks its screen rejoins as the same player.
6. The first player is the **VIP** and can start the game. The host can kick players and lock the room.
7. Rooms hold up to 8 players. Extra joiners become audience.

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

Fourteen games are planned. Each has its own epic in the backlog, and the names below are the approved names.

| Game | Inspired by | Phone input | Players | Epic |
|---|---|---|---|---|
| **Quick Draw** | 1-2-Switch "Quick Draw", Kirby Super Star "Samurai Kirby" | Tap when the TV shouts DRAW; early is a foul | 2 to 8, everyone draws at once | CC-10 |
| **Target Range** | Wii Sports Resort "Archery" | Aim with the phone like a bow, drag down to draw, let go to shoot | 1–8 at once | CC-11 |
| **Strike Night** | Wii Sports "Bowling" | Hold the grip, swing, release; twist for spin | 1–4 in turns | CC-12 |
| **Putt Club** | Wii Sports "Golf" putting, Mario Golf | Hold the grip and swing like a putter | 1–4 in turns | CC-13 |
| **Dinger Derby** | Wii Sports "Baseball", home run derby modes | Hold the grip and swing when the ball arrives | 1–8 in rotating turns | CC-14 |
| **Double Top** | Pub darts, Wii Party darts | Point the phone to aim, flick forward to throw | 2–8 in turns | CC-15 |
| **Tangle** | Achtung, die Kurve!, Tron light cycles | Hold left or right to steer | 2–8 at once | CC-16 |
| **Bumper Sumo** | Mario Party "Bumper Balls" | Tilt to roll, shake to dash | 2–8 at once | CC-17 |
| **Lob Squad** | Scorched Earth, Worms | Drag back like a slingshot for angle and power, release to fire | 2–8 in turns | CC-18 |
| **Blast Block** | Bomberman | Virtual d-pad and a bomb button | 2–8 at once | CC-19 |
| **Pixel Derby** | Konami "Track & Field", "Hyper Sports" | Alternate two big buttons; ease off to recover stamina | 2–8 at once | CC-20 |
| **Duck Season** | Duck Hunt (NES Zapper), Wii Remote pointer | Point the phone at the TV, tap to shoot | 1–4 at once | CC-21 |
| **Paddle Panic** | Pong, Atari "Warlords" | Drag slider for the paddle; optional tilt | 2–4 at once | CC-22 |
| **Bandeja** | Wii Sports "Tennis", padel | Swing at the right moment, forehand or backhand | 2–4, singles or doubles | CC-23 |

Quick Draw is the first playable game. Every motion control has a touch fallback.

"Inspired by" names what a game plays like, never what it copies. Game names are original. Art and sound are original or come from CC0 packs recoloured to the house style palettes and credited in the game's `CREDITS.md`. Never use assets, names or characters from existing games. See [Assets and credits](docs/HOUSE_STYLE.md#assets-and-credits).

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
| Rooms on Durable Objects | partyserver |
| Reconnecting WebSocket client | partysocket |
| Virtual joystick | nipplejs |
| 2D physics | Planck.js (`packages/physics`, fixed step) |
| Local Worker runtime | `@cloudflare/vite-plugin` (runs `workerd`) |
| Validation | Zod 4 (`zod/mini` on the phone) |
| Bot protection | Cloudflare Turnstile + Workers Rate Limiting binding |
| Testing | Vitest 4.1 (unit), `@cloudflare/vitest-plugin`, Playwright (E2E); fast-check and axe-core where a story needs them |
| Budgets | size-limit, Lighthouse CI |
| Import boundaries | dependency-cruiser |
| CI/CD | GitHub Actions + Wrangler |

> Every choice is free. See [`docs/TECH_STACK.md`](docs/TECH_STACK.md) for the research behind it, the alternatives that were rejected, and the open questions for the CC-1 spikes. Vite+ is postponed until 1.0; the configs stay plain Vite, Vitest and Oxc so a later move is cheap.

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
│   │   ├── test/              # Unit tests: rules, contract, replay
│   │   └── CREDITS.md         # Credits for every CC0 asset the game uses
│   ├── strike-night/
│   └── …                      # One package per game, 14 planned
├── packages/
│   ├── theme/                 # House style tokens → CSS variables + Phaser colours
│   ├── ui/                    # Vue components: buttons, panels, chips, Pips
│   ├── stage/                 # Phaser components: scoreboard, callouts, World Pips, transitions
│   ├── protocol/              # Message schemas and types
│   ├── game-sdk/              # Game contract, lifecycle, input throttling, registry
│   │   └── testing/           # testGameContract(), fake room, input replayer
│   ├── utils/                 # Pure helpers: room codes, math, easing, seeded RNG, timing
│   ├── motion/                # Sensor permissions, calibration, gesture detection
│   ├── physics/               # Deterministic 2D physics on Planck.js
│   └── config/                # Shared tsconfig bases and Vite/Vitest presets
├── e2e/                       # Playwright multi-device tests, one bot match per game
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

- Host: open `/host` on your laptop and enter `HOST_PASSCODE`
- Controller: scan the QR code on the host screen, or open the root URL on your phone and type the room code (same network, or use the dev tunnel below)

### Local secrets

`apps/server/.dev.vars`:

```bash
# Cloudflare's Turnstile test secret that always passes
TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
# Any long random string for local development
TICKET_SIGNING_SECRET=change-me-to-a-long-random-string
# The passcode the host enters to create a room
HOST_PASSCODE=change-me
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
| `pnpm test` | Runs unit and integration tests |
| `pnpm e2e` | Runs the Playwright multi-device E2E tests, including one bot-plays-a-match test per game |
| `pnpm check:style` | Fails on colours or fonts outside `@couchcade/theme`, off-palette sprites, `v-html` and `new Date()` in `shared/` |
| `pnpm check:deps` | Enforces import boundaries |
| `pnpm budgets` | Runs size-limit and Lighthouse CI |
| `pnpm assets:recolour <input> <scene>` | Maps a CC0 sprite onto the core + scene palette |
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

3. Export the definition from `src/index.ts`. The host's registry discovers every `games/*/src/index.ts` on its own, so there is no shared registry file to edit.
4. Before merging, the game must have:
   - Unit tests for its rules, including a passing `testGameContract(game)` suite and one recorded replay
   - One Playwright E2E test where bot phones play a full match
   - A touch fallback for every motion input
   - A `CREDITS.md` entry for every CC0 asset it uses
   - A house style review against [`docs/HOUSE_STYLE.md`](docs/HOUSE_STYLE.md)

---

## Testing

The test bar is deliberately lean:

- **Unit tests for game and platform logic.** Rules, state, protocol, relay behaviour and helpers are tested where the logic lives.
- **One bot-plays-a-match E2E test per game.** A host and bot phones play a full match in Playwright and a winner is asserted.
- **No coverage thresholds.** No package fails CI on a coverage percentage. A story's acceptance criteria say which tests it needs.

| Area | What is tested | Tools |
|---|---|---|
| Platform packages (`utils`, `protocol`, `theme`, `game-sdk`, `motion`, `physics`, …) | Unit tests for their logic; `motion` replays recorded sensor traces | Vitest, fast-check where useful |
| `ui` | Component behaviour and accessibility | Vitest, axe-core |
| `apps/server` | Room lifecycle, forwarding, hibernation rules, security rules | `@cloudflare/vitest-plugin` |
| Game rules | Unit tests for scoring and win conditions, `testGameContract(game)`, one recorded replay | Vitest, game-sdk/testing |
| Game match | Bot phones play a full match against the host, one test per game | Playwright |
| Platform E2E | Host creates a room and phones join | Playwright (Chromium + WebKit) |

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
 ├─ test                          unit + integration
 ├─ e2e                           multi-device E2E + one bot match per game, against the local Worker
 ├─ budgets                       size-limit + Lighthouse CI (assert only)
 └─ security                      pnpm audit + CodeQL
Merge to main
 └─ deploy                        wrangler deploy → smoke test on the live URL
```

- There are no preview deploys: Cloudflare doesn't create preview URLs for Workers with Durable Objects.
- Traces and reports are uploaded only when a job fails, and kept for 7 days.

---

## Security

Couchcade has no accounts, no chat, no email forms and no stored user content, so there is very little to abuse. Every entry point is still protected.

| Threat | Defence |
|---|---|
| Strangers or bots creating rooms | Host passcode required to create a room, rate-limited passcode attempts, Turnstile, 3 rooms per IP per minute, 1 active room per host session |
| Guessing room codes | Turnstile on join, 20 join attempts per IP per minute (every phone at a party shares one Wi-Fi IP), codes only valid while the host is connected |
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
npx wrangler secret put HOST_PASSCODE
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

A 2-hour game night uses roughly 15,000 Durable Object requests if the 20:1 ratio applies on Free, and more than the daily limit if it doesn't. The free-tier probe spike (CC-1.4) measures this before any game is built. See [`docs/TECH_STACK.md`](docs/TECH_STACK.md#the-request-budget) for the numbers and the fallback.

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

The roadmap is the backlog: one epic per area, each broken into stories in [`backlog/tasks/`](backlog/tasks/). Run `backlog task list --plain` for the current status.

### Platform

- [ ] **CC-1: Platform foundations and playable skeleton.** Monorepo, relay, host and controller shells, game SDK contract, clock sync, CI and deploy, ending with Quick Draw playable on the live site
- [ ] **CC-2: Security baseline and moderation.** Turnstile, rate limits, name rules, flood protection, security headers, host kick and lock
- [ ] **CC-3: Session flow and game SDK extensions.** Game menu, results, reconnects, recovery, real-time input helpers, lag compensation, TV lag calibration, physics, create-game template
- [ ] **CC-4: House style: design, theme, UI kit and stage.** Design canvas, theme tokens, fonts, UI kit, controller input components, stage overlays, CC0 asset pipeline, style checks
- [ ] **CC-5: Motion controls.** Sensor adapter with the iOS permission flow, calibration, gesture detectors, touch fallbacks, trace recorder
- [ ] **CC-6: Pips player avatars.** Parts spec, generator, Interface and World Pips, lobby customiser
- [ ] **CC-7: Sound, music and haptics.** CC0 effects and chiptune loops, haptics on Android, volume and reduced-motion settings
- [ ] **CC-8: Party mode.** Chains short games with running standings and a final podium
- [ ] **CC-9: Polish and launch.** Budgets, monitoring, attract mode, friendly errors, game night guide

### Games

- [ ] **CC-10: Quick Draw**
- [ ] **CC-11: Target Range**
- [ ] **CC-12: Strike Night**
- [ ] **CC-13: Putt Club**
- [ ] **CC-14: Dinger Derby**
- [ ] **CC-15: Double Top**
- [ ] **CC-16: Tangle**
- [ ] **CC-17: Bumper Sumo**
- [ ] **CC-18: Lob Squad**
- [ ] **CC-19: Blast Block**
- [ ] **CC-20: Pixel Derby**
- [ ] **CC-21: Duck Season**
- [ ] **CC-22: Paddle Panic**
- [ ] **CC-23: Bandeja**

---

## Contributing

1. Create a branch from `main`.
2. Keep changes inside the right package and follow the dependency direction.
3. Add or update unit tests for the game or platform logic you change. A new game also needs its bot-plays-a-match E2E test.
4. Run `pnpm check`, `pnpm test` and `pnpm check:style` locally.
5. Open a pull request. All CI checks must be green before merging.

Names must be original. Art and sounds must be original, or CC0 assets recoloured to the house style palettes with an entry in the game's `CREDITS.md`. Don't use assets, names or characters from existing games. All copy is in English.

---

## License

The code is released under the [MIT License](LICENSE). The Fredoka and Pixelify Sans fonts keep their own SIL Open Font License 1.1, shipped as `OFL.txt` next to the font files. CC0 assets don't require attribution, but each one is credited in its game's `CREDITS.md`, and those entries are collected into `docs/CREDITS.md`.
