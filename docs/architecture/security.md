# Security design

This is the threat model for Couchcade and the defences the CC-2 stories build. It covers who might abuse a friends-only party game on a public `workers.dev` URL, what each defence is, where it runs, and which test proves it.

**For the owner.** Read [Decisions at a glance](#decisions-at-a-glance), [Open decisions for the owner](#open-decisions-for-the-owner) and [Owner checklist](#owner-checklist). That takes about 15 minutes. The rest is detail for the stories.

**For agents.** Everything after the owner sections is binding, like [platform.md](platform.md). This doc adds security detail to platform.md and doesn't repeat it. Where a rule here isn't named in a story's acceptance criteria, the story that owns the file builds it and adds the test anyway. The [threat table](#threats-defences-and-tests) marks those rules with "added by this doc". Where this doc, platform.md and a story disagree, stop and flag it.

Status: draft, waiting for owner approval (CC-2.1).

---

## Contents

- [Decisions at a glance](#decisions-at-a-glance)
- [Open decisions for the owner](#open-decisions-for-the-owner)
- [Owner checklist](#owner-checklist)
- [What we protect, and from whom](#what-we-protect-and-from-whom)
- [Threats, defences and tests](#threats-defences-and-tests)
- [Where Turnstile runs](#where-turnstile-runs)
- [Check order per endpoint](#check-order-per-endpoint)
- [Rate limits](#rate-limits)
- [Flood protection and socket costs](#flood-protection-and-socket-costs)
- [Host passcode](#host-passcode)
- [Tickets, rejoin tokens and the room](#tickets-rejoin-tokens-and-the-room)
- [Messages](#messages)
- [Player names](#player-names)
- [XSS, CSP and headers](#xss-csp-and-headers)
- [Privacy and logs](#privacy-and-logs)
- [Supply chain, CI and accounts](#supply-chain-ci-and-accounts)
- [If something goes wrong](#if-something-goes-wrong)
- [Which story builds what](#which-story-builds-what)

---

## Decisions at a glance

Approving this doc approves these. The row marked "open" and some numbers in the detail sections depend on the choices in the next section.

| # | Decision | In plain words |
|---|---|---|
| 1 | The worst case is a day offline, never a bill | On the Free plan a used-up limit just stops requests until 02:00 Dutch summer time. Every defence here is free. An attacker can at most take the site down for the rest of the day. |
| 2 | We defend against bots and a mischievous guest | The URL and the code are public. We plan for scanners, bots, and someone at the party or in a group chat who knows the room code. We don't plan for paid attackers, a malicious host or friends cheating with a modified phone app. |
| 3 | One host passcode of 4 random words | Only the passcode creates rooms. It's a Worker secret, checked in constant time, typed into a masked field and never saved by the app. Four random words can't be guessed through the API. |
| 4 | Turnstile on create and join, nowhere else | The invisible check runs when the host submits the passcode and when a phone taps Join. It doesn't run on rejoin, sockets or page loads. The host still needs it because the rate limits are loose. |
| 5 | The Worker checks everything before a room is called | Rate limit, Turnstile, passcode, name and ticket are all checked in the Worker, cheapest first. A rejected request never costs a Durable Object request. |
| 6 | Rate limits are speed bumps, not quotas | CC-1.4 showed the binding lets several times the limit through on Free. We use it only to slow abuse. Limits are per IP address (per /64 block for IPv6) and never stored. |
| 7 | Tickets are typed, room-bound and short | A 60-second ticket opens one socket for one room and role. A rejoin token can't be used as a ticket. Kicked and flooding players are blocked by the room itself. |
| 8 | Flooding sockets are closed and can't come back (open) | Each socket has a token bucket. A socket that empties it is closed and its rejoin token stops working. The host's Kick and Lock room are the backstop. See open decision 1 for the numbers. |
| 9 | Games treat every input as untrusted | The relay drops messages a role may not send and overwrites `from`. The schema proves an input's shape. The game rules decide whether the move is allowed right now. |
| 10 | Names are short, Latin and filtered | 1 to 12 characters after NFKC, Latin letters with accents, digits, space and `' - . _`. No emoji. An NL and EN blocklist runs on a folded form. Kick is the backstop because no list catches everything. |
| 11 | User text is only ever text | No `v-html`, and the README's strict CSP with no inline scripts. Static files get their headers from a generated `_headers` file, so page loads still skip the Worker. |
| 12 | No personal data kept | No cookies, IPs only as rate-limit keys in memory, automatic request logs off, and no tokens, names or passcodes in any log line. |
| 13 | The supply chain is locked down with free tools | pnpm release age and blocked install scripts, frozen lockfile, Renovate, SHA-pinned actions, CodeQL and `pnpm audit`. Turnstile is the only third-party script on any page. |
| 14 | Accounts matter most | A stolen GitHub or Cloudflare login could ship bad code to every guest's phone. Both accounts use two-factor sign-in, and the deploy token only has Workers permissions. |

---

## Open decisions for the owner

Each of these changes a number or a promise that the README or a story already states. The recommendation is what this doc assumes if you approve without comment.

### 1. How big is a phone's flood bucket?

The README, platform.md and CC-2.5 say 20 messages per second with a burst of 40, for every socket. Every incoming message costs 1 Durable Object request (CC-1.4). So one misbehaving phone that stays just under 20 per second costs about 72,000 requests an hour and uses up the whole day in about 80 minutes, without ever being disconnected.

A legitimate phone never needs that. The batching helper caps input at 4 per second, and the busiest honest second is a reconnect during real-time play: 5 clock samples plus 4 inputs plus a tap.

- **Recommended: phones get 5 per second with a burst of 15. The host keeps 20 with a burst of 40.** A phone flooding at 5 per second costs 18,000 requests an hour, which leaves the host hours to notice and kick. This amends CC-2.5 criterion 1 and one line in platform.md. If CC-1.4's 20:1 ratio is confirmed later, the phone bucket rises with the phone cap.
- Keep 20 and 40 for everyone. Simpler, but one phone can empty the day.

### 2. Is 10 joins per minute per IP enough on shared Wi-Fi?

CC-2.3 limits join attempts to 10 per IP per minute. At a party every phone on the home Wi-Fi shares one public IP. Eight friends scanning the QR code at once, plus a typo, a rejected name and someone who reloads, gets close to 10 at the worst possible moment.

- **Recommended: 20 join attempts per IP per minute.** Turnstile, not the rate limit, is what stops bots. Amends CC-2.3 criterion 2.
- Keep 10. The binding counts loosely, so in practice more get through, but we can't rely on that.

### 3. Keep the "interactive challenge after 3 wrong codes"?

The README promises it, but no story builds it. It needs a second Turnstile widget and a per-IP count of wrong codes in the Worker. Code guessing is already impractical. There are 331,776 codes and a code only works while its TV is connected. At the nominal limit, one IP needs about 11 days of non-stop guessing, each guess passing Turnstile, for an even chance of hitting a room that lives for an evening.

- **Recommended: drop it from the README.** Revisit only if the logs show guessing.
- Keep it and add a story to CC-2.

### 4. Cap the audience?

Platform.md makes the 9th and later joiners audience, with no upper limit. Every socket costs keep-alive and clock requests (about 264 an hour when idle) and gets its own flood bucket. One person holding the code can open dozens of audience sockets until the host locks the room. CC-9.4 already has a "Room is full" screen that nothing triggers.

- **Recommended: at most 16 phones per room, 8 players and 8 audience.** The join API returns 409 `room-full`. This amends the HTTP API table and the room status check in platform.md, and CC-3.10.
- No cap. Lock room is the only limit.

---

## Owner checklist

These are the parts no story can do for you.

1. **Choose the production passcode** as 4 random words from a word list, for example with a password manager's passphrase generator. Set it with `npx wrangler secret put HOST_PASSCODE`. Never reuse `change-me` or a password you use elsewhere.
2. **Set `TICKET_SIGNING_SECRET`** to 32 random bytes: `openssl rand -base64 32`.
3. **Turn on two-factor sign-in** (a passkey or an authenticator app) for GitHub and Cloudflare.
4. **Create the Turnstile widget** in the Cloudflare dashboard: mode Invisible, hostname `couchcade.<account>.workers.dev`. Set its secret with `npx wrangler secret put TURNSTILE_SECRET_KEY`.
5. **Share the passcode only with people who host.** Players never need it.

---

## What we protect, and from whom

### Assets

| Asset | Why it matters | Worst realistic loss |
|---|---|---|
| The daily free quota | 100,000 Durable Object requests and 100,000 Worker requests a day | The site stops until 00:00 UTC. No charge. |
| The evening itself | A room the host controls, a TV friends are looking at | A stranger or rude name on the TV, a player pushed out of a game |
| The site's code | Every guest runs our JavaScript on their phone | Malicious code served to guests. This is the one serious outcome. |
| Secrets | `HOST_PASSCODE`, `TICKET_SIGNING_SECRET`, `TURNSTILE_SECRET_KEY`, the Cloudflare deploy token | Rooms created by strangers, forged tickets, a malicious deploy |
| Player data | A chosen name, a Pip, an IP address in memory | Very little. Nothing is kept after a room closes. |

### Attackers

| Who | What they can do | In scope |
|---|---|---|
| Scanners and bots | Find the `workers.dev` URL in the public repo, hit every endpoint, script requests | Yes |
| A guest who knows the room code | Join, pick a rude name, spam inputs, share the QR code in a group chat | Yes |
| Someone who learned the passcode | Create rooms and use up the quota | Yes, by rotating the passcode |
| A compromised npm package or GitHub Action | Run code in CI or ship it to phones | Yes |
| Someone with a solving service for Turnstile | Guess codes or passcodes at scale, for money | Only as far as limits slow them. The worst case is row 1 of the assets table. |
| A friend with a modified phone app | Claim an earlier tap, send inputs out of turn | Partly. Games check turns and the host clamps `at` to 500 ms. Cheating beyond that is a social problem. |
| The host | Everything in their room | No. The host holds the passcode and is trusted. |
| Large DDoS, Cloudflare itself, a stolen laptop | | No |

---

## Threats, defences and tests

"Added by this doc" means the rule isn't in the owning story's acceptance criteria yet, and the story builds and tests it anyway. Epic CC-2 closes only when every row has a passing test.

| Threat | Defences | Test (story) |
|---|---|---|
| **Passcode brute force** | 4-word passcode (about 3.7 × 10¹⁵ options). Turnstile before the passcode check. 5 passcode attempts per IP per minute. Constant-time compare. Passcode only in a POST body, never logged, never saved by the host app. | Wrong passcode returns 401, missing passcode returns 401 (CC-1.10). Invalid Turnstile token returns 403 before the passcode is checked (CC-2.2). The 6th attempt in a minute returns 429 (CC-2.3). The compare goes through `timingSafeEqual` (unit test, CC-1.10, added by this doc). |
| **Room creation spam** | Everything above, then 3 room creations per IP per minute before the room is called. Rooms without a TV close after 30 minutes. A refreshed TV rejoins its room instead of creating a new one. | The 4th creation in a minute returns 429 and the Durable Object isn't called (CC-2.3). Idle room expires through the alarm (CC-1.9). A reloaded host keeps its room (CC-3.5 E2E). |
| **Room code guessing** | Codes work only while the TV is connected. Turnstile on every join. 10 join attempts per IP per minute (open decision 2). A code that doesn't match `^[A-HJ-NP-Z]{4}$` returns 404 without calling a room. | Missing Turnstile token returns 403 (CC-2.2). The 11th attempt returns 429 and no room is called (CC-2.3). A room without a connected host returns 404 (CC-1.10, added by this doc). A malformed code returns 404 without a room call (CC-1.10, added by this doc). |
| **Direct WebSocket access** | Signed ticket required, checked in the Worker: `k` is `ticket`, not expired, room matches the path. `Origin` must equal the site's origin. Upgrade rate limit. The Worker strips incoming `x-cc-*` headers. `/internal/*` paths are never routed from outside. | Upgrades with no ticket, a bad signature, an expired ticket or another room's ticket get 401 and no room call (CC-1.10). Wrong `Origin` gets 403 (CC-1.10, added by this doc). A player ticket with a forged `x-cc-role: host` header connects as a player (CC-1.10, added by this doc). `POST /internal/create` from outside doesn't reach a room (CC-1.10, added by this doc). |
| **Stolen or reused tokens** | A rejoin token can't pass as a ticket, because `k` differs. The room refuses kicked and revoked player ids and seats past the 2-minute window. The newest connection for a player wins. Rejoin rate limit. | A rejoin token used as a ticket gets 401 (CC-1.10, added by this doc). A kicked player's rejoin closes with 4003 (CC-2.6). A revoked player's rejoin closes with 4008 (CC-2.5). A late rejoin closes with 4011 (CC-3.4). |
| **Flooding** | Token bucket per socket (open decision 1), counting every frame that reaches the handler, including dropped ones. Violators close with 4008 and their rejoin token is revoked. The host kicks and locks. | A test floods a socket and asserts the close and the revocation (CC-2.5). Kick closes with 4003 and a locked room returns 423 to new joins (CC-2.6). |
| **Quota burn through extra sockets** | Keep-alive answered without waking the room. Rooms close after 30 minutes idle or 4 hours. At most 16 phones per room (open decision 4). | Hibernation and alarm tests (CC-1.9). The 17th join returns 409 (CC-3.10, if decision 4 is approved). |
| **Malformed or oversized messages** | 1 KB cap before parsing. Envelope and per-type schema on both ends. Binary frames dropped. Invalid messages dropped silently and counted against the bucket. | `encode` and `decode` reject over 1 KB, with valid and invalid fixtures per message (CC-1.8). The room drops an oversized and a malformed frame without forwarding (CC-1.9, added by this doc). |
| **Messages a role may not send** | The room drops types the sender's role can't send, overwrites `from`, and drops audience `input`. The host drops inputs that fail the game's `inputSchema` and ignores `ui:action` start and pick from anyone but the VIP. Game rules check turn and phase. | Phone input reaches only the host (CC-1.9). A phone sending `room:kick` or a forged `from` has no effect (CC-1.9, added by this doc). Invalid inputs are dropped (CC-1.15). A non-VIP start is ignored (CC-1.15, added by this doc). |
| **Offensive or malicious names** | NFKC, 1 to 12 characters, character allowlist, NL and EN blocklist on a folded form, checked by the Worker before a ticket is issued. Kick as backstop. | Length and allowlist tests, blocklist rejection with the referee-voice message, fast-check properties for normalisation (CC-2.4). |
| **XSS and injected content** | Names and all other user text rendered as text. `v-html` banned. `?room=` validated before use. Strict CSP with no inline script and no `eval`. `frame-ancestors 'none'`. | `check:style` fails on `v-html` (CC-4.10). Every header asserted (CC-2.7). CSP allows `challenges.cloudflare.com` (CC-2.7). No CSP violations in Chrome and on an iPhone on the first deploy (manual, recorded in CC-2.7 notes, added by this doc). |
| **Supply chain** | pnpm `minimumReleaseAge`, blocked install scripts except `esbuild` and `workerd`, frozen lockfile, Renovate, actions pinned to SHAs, read-only workflow permissions, CodeQL, `pnpm audit`, Dependabot alerts. | `pnpm install --frozen-lockfile` in CI (CC-1.5, CC-1.6). SHA pins (CC-1.6). CodeQL, `pnpm audit` and alerts have no story yet. See [Follow-ups](#follow-ups). |
| **Leaked deploy credentials or account takeover** | Two-factor sign-in on GitHub and Cloudflare. Deploy token as a GitHub secret, used only by `deploy.yml` on `main`, with Workers permissions on this account only. Fork PRs get no secrets. Branch protection on `main`. | Deploy runs only after CI on `main` (CC-1.18). Branch protection and token scope have no story yet. See [Follow-ups](#follow-ups). |
| **Secrets in the repo or logs** | `.dev.vars` and `.env*` gitignored. Production secrets only through `wrangler secret put`. No tokens, passcodes, names or IPs in log lines. Automatic invocation logs off. | `.gitignore` covers `apps/server/.dev.vars` (CC-1.5). `.dev.vars.example` holds only test values (CC-1.10). `wrangler.jsonc` turns invocation logs off (CC-1.9, added by this doc). |

---

## Where Turnstile runs

Hosting now needs a passcode, so the question was whether room creation still needs Turnstile. It does. The Rate Limiting binding lets several times its limit through on Free, so on its own it doesn't stop a script guessing passcodes. Turnstile makes every guess cost a solved challenge, costs nothing, and the host solves it about once a night.

| Place | Turnstile? | Why |
|---|---|---|
| `POST /api/rooms` (host submits the passcode) | Yes, action `create` | Makes passcode guessing and room spam expensive for bots |
| `POST /api/rooms/:code/join` (phone taps Join) | Yes, action `join` | Makes code guessing expensive. Each wrong code would otherwise cost a Durable Object request. |
| `POST /api/rooms/:code/rejoin` | No | The rejoin token already proves an earlier pass. Rejoins happen after every deploy and screen lock. |
| `GET /ws/:code` | No | The 60-second ticket proves a pass seconds earlier |
| Page loads and static files | No | Static files never run the Worker |
| Messages on an open socket | No | The ticket and the flood bucket cover them |

How it works:

1. One widget in Invisible mode, for the production hostname. The site key is public and built into both apps. The secret is a Worker secret.
2. Both apps render the widget with `execution: "execute"` and run it when the user submits, so the token is always fresh. Tokens are single-use and valid for 300 seconds.
3. The Worker calls Siteverify once per request. It requires `success`, and in production also `action` matching the endpoint and `hostname` matching the request. A `join` token can't create a room.
4. Cloudflare's test secrets (starting `1x0000`, `2x0000` or `3x0000`) return fixed `action` and `hostname` values, so those two checks are skipped when a test secret is configured. Development and tests use the test keys and the dummy token `XXXX.DUMMY.TOKEN.XXXX` (CC-2.2).
5. **Fail closed.** If Siteverify errors or times out after 3 seconds, the API returns 403 `turnstile-unavailable`. The apps reset the widget and let the user try again. A Turnstile outage blocking a party for a few minutes is better than an open door.
6. On any 403 the app resets the widget before retrying, because the old token is spent.
7. Siteverify is a subrequest from the Worker. It uses no Durable Object request, and waiting for it doesn't count as CPU time.

---

## Check order per endpoint

Cheap checks run first, and nothing reaches a room until every check has passed. This extends the upgrade checks in [platform.md](platform.md#worker-routing).

**`POST /api/rooms`**

1. Passcode-attempt limit, 5 per IP per minute, counted on every attempt. Else 429.
2. Body is JSON under 1 KB and matches the schema. Else 400.
3. Turnstile, action `create`. Else 403.
4. Passcode, constant-time. Else 401.
5. Room-creation limit, 3 per IP per minute. Else 429.
6. `/internal/create` on the room, up to 5 code attempts.

The passcode limit counts every attempt, not only wrong ones. The binding can only count and answer in one call, so counting only failures would mean checking the passcode before the limit, and then the limit would never stop a lucky guess. A host who mistypes 5 times waits a minute. That's fine.

**`POST /api/rooms/:code/join`**

1. Join limit, 10 per IP per minute (open decision 2). Else 429.
2. Code matches `^[A-HJ-NP-Z]{4}$`. Else 404. Body is JSON under 1 KB and matches the schema. Else 400.
3. Name rules. Else 400. This runs before Turnstile so a rejected name doesn't spend the token. The phone runs the same check first.
4. Turnstile, action `join`. Else 403.
5. `/internal/status` on the room: live, not locked, not full. Else 404, 423 or 409.
6. Sign the ticket and rejoin token.

**`POST /api/rooms/:code/rejoin`**

1. Rejoin limit, 30 per IP per minute. Else 429.
2. Code format and body schema. Else 400.
3. Signature valid, `k` is `rejoin`, `r` matches the path. Else 401.
4. Sign a fresh ticket. No room call. The room checks kicked, revoked and the seat window when the socket connects.

**`GET /ws/:code`**

The five steps in platform.md, with the upgrade limit at 30 per IP per minute in step 4, and the code format checked by the route itself.

---

## Rate limits

All limits use the Workers Rate Limiting binding with a 60-second period, declared in `apps/server/wrangler.jsonc` and applied in `apps/server/src/security/rate-limits.ts` (CC-2.3).

| Binding | Counts | Limit per IP per minute | Source |
|---|---|---|---|
| `RL_PASSCODE` | Every `POST /api/rooms` | 5 | CC-2.3 criterion 3 |
| `RL_CREATE` | Room creations that passed the passcode | 3 | CC-2.3 criterion 1 |
| `RL_JOIN` | Every join attempt | 10, or 20 (open decision 2) | CC-2.3 criterion 2 |
| `RL_REJOIN` | Every rejoin | 30 | This doc |
| `RL_UPGRADE` | Every `/ws` upgrade | 30 | This doc, platform.md step 4 |

Rules:

1. **Key.** The `CF-Connecting-IP` header. For IPv6, the first 64 bits, because one home or phone gets a whole /64 block. Prefix the key with the binding's purpose so tests read clearly. In local tests, pass the header explicitly.
2. **Speed bumps only.** CC-1.4 measured 151 of 271 requests passing a limit of 10 per 60 seconds. Counts are per Cloudflare location and eventually consistent. Never build a feature that depends on an exact count.
3. **Why 30 for rejoin and upgrade.** A deploy disconnects every socket at once. A TV and 8 phones on one Wi-Fi reconnect together, each with a rejoin and an upgrade, and partysocket retries on failure.
4. **Order.** A limit is always checked before Turnstile and before any room call. A 429 costs one Worker request and no Durable Object request (CC-2.3 criterion 4).
5. **Never stored.** The binding holds the key in Cloudflare's memory. We don't write IPs anywhere.
6. **What 429 looks like.** Body `{ error: "rate-limited" }`. The apps show a referee-voice "Too many tries. Wait a minute and try again." and don't retry on their own.

### Why this is enough

- **Passcode.** At 5 attempts a minute, even multiplied by the binding's looseness and a hundred IPs, a 4-word passcode holds for more than a million years. The limits matter only for a weak passcode, which is why the checklist asks for 4 words.
- **Codes.** 24⁴ is 331,776 codes. One IP at 10 guesses a minute makes 14,400 guesses a day and needs about 11 days for an even chance at one live room. Each guess also needs a Turnstile pass.
- **The real cost is the quota.** Each join attempt that passes Turnstile costs 1 Durable Object request for the status check, even for a wrong code. A bot that solves Turnstile at the loose limit could use up a day's requests. Turnstile is what prevents that, and if it fails, the outcome is a day offline.

---

## Flood protection and socket costs

Built in `apps/server/src/room/flood.ts` (CC-2.5). Platform.md's hibernation rules still apply: the bucket lives in `connection.setState()` and the room never uses timers.

1. **Bucket.** Tokens refill from the time since the last message, computed on each message. No timer.
2. **Sizes.** Host: 20 per second, burst 40. Phones: 5 per second, burst 15 if open decision 1 is approved, otherwise 20 and 40.
3. **What counts.** Every frame that reaches `onMessage`, including frames dropped for size, bad JSON, schema or role. The raw keep-alive `ping` never reaches the handler, so it can't count.
4. **Violation.** Close with 4008, set `revoked` on the player row, send `player:left { reason: "kicked" }` to the host. Platform.md has no separate flooding reason, and `kicked` frees the seat like a kick does. The phone shows the connection-lost screen and doesn't reconnect.
5. **After a violation.** The rejoin token no longer works. The person can still join again as a new player through `/join`, with Turnstile and the join limit. If they do it again, the host locks the room. We don't ban IPs, because that means storing them.
6. **The host socket** gets the same treatment. A host that floods is a bug, and stopping it before it uses the day is right.

What one socket can cost per hour, at 1 request per incoming message:

| Sending | Requests per hour | Whole day's 100,000 used in |
|---|---|---|
| Honest phone at the real-time cap, 4 per second | 14,400 | about 7 hours |
| Flooding just under 5 per second | 18,000 | about 5.5 hours |
| Flooding just under 20 per second | 72,000 | about 80 minutes |
| Idle socket, keep-alive and clock only | about 264 | never, in one evening |

A bucket can't go below the honest cap, so no per-socket limit makes a hostile player free. It only buys the host time to notice and kick.

---

## Host passcode

1. **One shared secret.** `HOST_PASSCODE` is a Worker secret. There are no host accounts.
2. **Strength.** 4 random words from a large word list, or 16 random characters. The owner picks it ([checklist](#owner-checklist)).
3. **Compare.** Hash both the submitted and the stored passcode with SHA-256, then compare the digests with `crypto.subtle.timingSafeEqual`. Hashing first makes both sides the same length.
4. **Transport.** Only in the JSON body of `POST /api/rooms` over HTTPS. Never in a URL, header, log line or error message.
5. **In the host app.** An `<input type="password" autocomplete="current-password">`, masked because the laptop screen is on the TV. The app keeps the passcode in memory only until the request finishes. The browser's password manager may offer to save it, which is the owner's choice per laptop.
6. **After creation.** The host uses its rejoin token for the rest of the room's life. A refreshed TV never asks for the passcode again while its room is alive.
7. **Rotation.** `npx wrangler secret put HOST_PASSCODE` deploys a new version. Live rooms keep going, because the passcode only gates creation.

---

## Tickets, rejoin tokens and the room

Formats and lifetimes are in [platform.md](platform.md#tickets-and-rejoin-tokens). These are the security rules around them (CC-1.10).

1. **Secret.** `TICKET_SIGNING_SECRET` is 32 random bytes. The Worker imports it once per isolate as an HMAC-SHA-256 `CryptoKey` and verifies with `crypto.subtle.verify`, which compares in constant time.
2. **Typed.** Every check requires the expected `k`. A rejoin token presented as a ticket fails, and the other way round.
3. **Bound.** `r` must equal the code in the path. `role` must be `host` or `player`. `exp` must be in the future. Any decoding error is a 401, never a 500.
4. **Replay.** A ticket can be reused within its 60 seconds. That's accepted: it opens the same player's socket, and the newest connection wins with 4009.
5. **Tickets in URLs.** A ticket sits in the `/ws` query string, so it can appear in Cloudflare's request logs. It expires in 60 seconds and those logs are off ([Privacy and logs](#privacy-and-logs)). Rejoin tokens only travel in request bodies.
6. **Revocation lives in the room.** `/rejoin` doesn't call the room, so the room checks `kicked`, `revoked` and the 2-minute seat window on connect and closes with 4003, 4008 or 4011.
7. **Headers to the room.** The Worker deletes every incoming `x-cc-*` header, then sets them from the verified ticket. `x-cc-name` is percent-encoded, because header values can't carry non-ASCII names.
8. **The room is internal.** The route for sockets is exactly `/ws/` plus a valid code. `/internal/*` exists only on `stub.fetch()` calls from the Worker. From outside it never runs the Worker, because only `/api/*` and `/ws/*` do.
9. **`Origin`.** Stops another website from opening a socket from a guest's browser. Scripts can fake it, so the ticket stays the real gate.
10. **Rotation.** Changing `TICKET_SIGNING_SECRET` invalidates every rejoin token. Everyone, the host included, has to start over. Use it only after a leak.

---

## Messages

Platform.md lists [what the room does with each message](platform.md#what-the-room-does-with-each-message). On top of that:

1. **Binary frames** are dropped and counted against the bucket. Every valid frame is UTF-8 text.
2. **The size check comes first.** If a string has more than 1,024 UTF-16 code units, it's over 1 KB and is dropped without encoding or parsing.
3. **Only the relay sets `from`**, and only on player-to-host messages.
4. **Shape isn't permission.** A phone can send any schema-valid input at any time, from any player id it owns. Game rules check whose turn it is, the phase and the player's state before applying an input. Host runtime code checks that `ui:action` `start` and `pick-game` come from the VIP (CC-1.15, CC-3.2).
5. **`at` is a claim.** The host clamps it to the last 500 ms (platform.md). A cheating phone can claim at most 500 ms, which is out of scope.
6. **Parsed JSON is data.** Never `Object.assign` a parsed payload onto an existing object, because a `__proto__` key would change its prototype. Use schema output or spread syntax.
7. **The host is trusted.** Its messages pass the same size and schema checks, but the relay doesn't second-guess `controller:state` content.

---

## Player names

Built in `packages/utils/src/names/` and checked in `apps/server/src/security/names.ts` (CC-2.4). The phone runs the same `utils` function before submitting, so honest players get instant feedback. The Worker's check is the one that counts.

### Normalising and allowing

1. Apply NFKC, trim, and collapse runs of spaces into one.
2. Length is 1 to 12 code points after that.
3. Allowed: `A-Z`, `a-z`, Latin letters with accents (Latin-1 Supplement and Latin Extended-A letters), digits, space, and `'`, `-`, `.`, `_`. At least one letter or digit.
4. Not allowed: emoji, symbols, control characters, zero-width and bidirectional formatting characters, and every other script. Homoglyph tricks like a Cyrillic "а" fall out here.
5. The allowlist must match the glyphs in the subsetted fonts (CC-4.x). A name must never show as boxes on the TV.

### Blocklist

1. The check runs on a folded copy. The stored name stays as the player typed it after normalising.
2. Folding: lowercase, strip accents, map common swaps (`0`→o, `1`→i, `3`→e, `4`→a, `5`→s, `7`→t, `@`→a, `$`→s), remove everything but letters, and collapse repeated letters.
3. Two lists, NL and EN, in `packages/utils/src/names/`. Longer words that are never part of a normal name match anywhere in the folded name. Short words match only the whole folded name, so ordinary names don't trip them.
4. A rejected name gets `{ error: "name-not-allowed" }`, shown in the referee voice, for example "That name's a foul. Pick another one."
5. The lists are public in the repo. That's fine. They're a filter for a party, not a secret.
6. Kick is the backstop. No list is complete, and the host sees every name in the lobby.

---

## XSS, CSP and headers

### Text stays text

1. Vue templates use interpolation only. `v-html` is banned by `check:style` (CC-4.10).
2. Phaser draws names on a canvas, which can't run markup.
3. The controller reads `?room=` and uses it only if it matches the code format.
4. Controller views come from the host and are rendered by game components with interpolation, like everything else.
5. No `innerHTML`, `insertAdjacentHTML`, `eval` or `new Function` in app, package or game code. The CSP blocks inline scripts and `eval` anyway.

### Headers

The headers are the README's, unchanged. `apps/server/src/security/headers.ts` is the single source (CC-2.7).

1. **Static files** get them from a `_headers` file generated at build time from `headers.ts` and copied into `dist/public`, with one rule for `/*`. Workers Static Assets applies it without running the Worker, so page loads stay free.
2. **Worker responses** (`/api/*`, `/ws/*` errors) get the same headers set in the Worker.
3. **Turnstile** needs `script-src` and `frame-src` for `https://challenges.cloudflare.com`, which the README's CSP already allows.
4. **The CSP applies only to built output.** The Vite dev server injects inline scripts for hot reload, so development runs without it.
5. **WebSockets and `connect-src 'self'`.** Older Safari versions didn't match `wss:` with `'self'`. The first-deploy check confirms the socket connects on an iPhone. If it doesn't, add the site's `wss://` origin to `connect-src`.
6. **HSTS** changes nothing today, because the whole `.dev` domain is already HTTPS-only in browsers. It stays for a future custom domain. Revisit `includeSubDomains; preload` before adding one.
7. **Tests.** A unit test asserts every header in `headers.ts`, in the generated `_headers`, and on an API response (CC-2.7). On the first deploy with CC-2.7, the story opens `/` and `/host/` in Chrome and on an iPhone, confirms no CSP errors in the console and a working Turnstile and socket, and records it in its notes.

---

## Privacy and logs

The README's privacy promises hold: no cookies, no analytics, IPs only in memory, room data deleted on close.

1. **Automatic invocation logs off.** Cloudflare's per-request logs record the full URL, which for `/ws` contains the ticket. Set `observability.logs.invocation_logs` to `false` in `wrangler.jsonc` (CC-1.9) and check the key against the wrangler docs when adding it.
2. **Our own log lines** keep the sampling from platform.md and contain no IPs, tickets, rejoin tokens, passcodes or player names. Log the error code and the room code, nothing else.
3. **Turnstile.** Siteverify gets the token and secret only. We don't send `remoteip`.
4. **Rooms** delete all storage when they close (platform.md).

---

## Supply chain, CI and accounts

### Dependencies

1. pnpm's `minimumReleaseAge` keeps brand-new versions out for a day, which catches most hijacked releases before we install them.
2. pnpm blocks install scripts by default. Only `esbuild` and `workerd` are allowed (`allowBuilds` in `pnpm-workspace.yaml`). Adding a package to that list needs a reason in the PR.
3. CI installs with `--frozen-lockfile` (CC-1.5, CC-1.6). Lockfile conflicts follow platform.md and are never hand-merged.
4. Renovate proposes updates (CC-1.6). Security fixes don't wait for the weekly group.
5. `pnpm audit --prod --audit-level high` runs in CI and fails the build. Dev-only advisories show in Dependabot alerts without blocking merges.
6. No runtime code from other sites. Fonts and assets are self-hosted. Turnstile is the only third-party script.

### GitHub Actions

1. Every action is pinned to a full commit SHA (CC-1.6). Renovate updates the pins.
2. Every workflow sets `permissions: contents: read` at the top and widens it per job only when needed.
3. No `pull_request_target` workflows. Pull requests from forks get no secrets.
4. `CLOUDFLARE_API_TOKEN` is used only by `deploy.yml`, which runs on `main` after CI passes (CC-1.18).
5. CodeQL default setup runs on pull requests and on `main`.

### Accounts and repository settings

1. Two-factor sign-in on GitHub and Cloudflare ([checklist](#owner-checklist)).
2. The Cloudflare deploy token has Workers permissions on this one account and nothing for DNS, zones, billing or other accounts.
3. Branch protection on `main`: pull requests only, CI must pass, no force pushes. This fits the working agreement that reviewed PRs merge without the owner.
4. Private vulnerability reporting and Dependabot alerts are on, as the README promises.

---

## If something goes wrong

| What you see | What to do |
|---|---|
| A stranger or rude name in your room | Kick them, then turn on Lock room |
| Rooms you didn't create, or the passcode got out | `npx wrangler secret put HOST_PASSCODE` with 4 new words. Live rooms keep playing. |
| The quota runs out and you don't know why | Check Workers analytics for the busy endpoint. Rotate the passcode. If it's socket traffic, rotate `TICKET_SIGNING_SECRET` too, which ends every room. Otherwise wait for 02:00. |
| The deploy token may have leaked | Roll it in the Cloudflare dashboard and update the GitHub secret |
| Someone reports a vulnerability | It arrives through GitHub's private reporting. Fix it on a branch and credit them if they want. |
| A dependency advisory | Renovate or Dependabot opens a PR. Merge it once CI passes. |

---

## Which story builds what

| Area | Stories |
|---|---|
| Passcode check, tickets, rejoin tokens, `Origin`, header stripping, code format | CC-1.10 |
| Hibernation, room expiry, role checks, frame drops, invocation logs off | CC-1.9 |
| Message schemas and the 1 KB cap | CC-1.8 |
| Turnstile | CC-2.2 |
| Rate limits | CC-2.3 |
| Player names | CC-2.4 |
| Flood protection and revocation | CC-2.5 |
| Kick and lock | CC-2.6 |
| Headers, CSP, `_headers` and the first-deploy browser check | CC-2.7 |
| Rejoin window | CC-3.4 |
| Host recovery | CC-3.5 |
| Audience and the room cap | CC-3.10 |
| VIP-only start and input schema checks | CC-1.15, CC-3.2 |
| `v-html` ban | CC-4.10 |
| Frozen lockfile, SHA pins, Renovate | CC-1.5, CC-1.6 |
| Deploy workflow | CC-1.18 |
| Error screens for 409, 423 and 429 | CC-9.4 |

### Follow-ups

These defences have no story yet. They need a new CC-2 story, planned with `backlog-plan`:

1. **Repository security setup.** Turn on CodeQL default setup, Dependabot alerts and private vulnerability reporting. Add branch protection on `main`. Add `pnpm audit --prod --audit-level high` to CI. Confirm the settings with `gh api` and record the output in the story notes.
2. **Decision updates.** Once the owner answers the open decisions, amend CC-2.3, CC-2.5, CC-3.10, platform.md and the README to match.
