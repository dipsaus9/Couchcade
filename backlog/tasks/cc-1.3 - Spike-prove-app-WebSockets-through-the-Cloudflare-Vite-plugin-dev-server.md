---
id: CC-1.3
title: 'Spike: prove app WebSockets through the Cloudflare Vite plugin dev server'
status: In Progress
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 14:57'
labels:
  - story
dependencies: []
references:
  - spikes/dev-websocket/
parent_task_id: CC-1
priority: high
type: spike
ordinal: 26000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A recorded decision on how local development serves WebSockets to the Room Durable Object.
Justification: open issue workers-sdk#15654 (2026-09-15) reports the dev server closing non-Vite sockets; only running it settles this.

Type: spike
Branch: CC-1.3/dev-server-websockets
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A throwaway prototype in spikes/dev-websocket/ exchanges 100 messages between a host page and a phone page through a Durable Object on the local dev server, or the failure is reproduced
- [x] #2 The decision (Vite plugin dev server, or wrangler dev behind a Vite proxy) is recorded in the final summary with evidence
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Check workers-sdk#15654 and any fix PR with gh.
2. Build spikes/dev-websocket/: Worker + partyserver Room DO (SQLite, hibernation), vite.config.ts with @cloudflare/vite-plugin, vite.proxy.config.ts for the wrangler dev fallback, host/phone page, node and browser test clients.
3. Run 100+ messages host<->phone on the Vite plugin dev server; probe the #15654 edge cases (HMR socket, subprotocol, unrouted path, idle, Worker edit).
4. Run the same relay test on wrangler dev behind a Vite proxy for comparison.
5. Record findings and decision; kill every dev server.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Issue check (2026-09-16, gh): workers-sdk#15654 is OPEN (label package:vite-plugin). Fix PR #15659 (community) is OPEN, not merged. Scope of the bug: the plugin's httpServer 'upgrade' listener forwards every non-'vite*'-subprotocol upgrade to the Worker and calls socket.destroy() when the Worker returns no webSocket. It breaks OTHER WebSocket servers mounted on the Vite dev server (e.g. Vite DevTools /__devtools/__ws). It does not affect sockets the Worker itself accepts.

Versions: @cloudflare/vite-plugin 1.54.9 (bundles workerd 1.20260911.1, miniflare 5.20260911.1-alpha), vite 8.3.0, wrangler 4.131.2, partyserver 0.5.10, @cloudflare/workers-types 5.20260914.1, typescript 6.0.3, Node 24.14.1, pnpm 11.27.0, Chrome 152.0.7977.85 headless, macOS arm64. The plugin source in dist/index.mjs (handleWebSocket) still has the destroy-on-no-webSocket path.

Vite plugin dev server (:5173), node relay-test (strict ping-pong, order checked): 100/side -> sent=200 received 100+100 ordered=true 200-227ms; 1000/side -> 2000 msgs 1494ms; 5000/side -> 10000 msgs 7967ms. All exit 0, closes 1000. Browser: headless Chrome host page + phone page (browser-test.mjs over CDP) -> 'phone done sent=100 received=100', 'host received=100 sent=100'. DO state landed in .wrangler/state/v3/do/spike-dev-websocket-Room/*.sqlite (SQLite-backed).

Edge cases on the Vite plugin dev server: (1) Vite HMR socket (vite-hmr) open next to app sockets, both work. (2) App socket requesting subprotocol couchcade.v1 fails (1006; curl got 400 once, then no response) because partyserver does not echo Sec-WebSocket-Protocol. Same 1006 on plain wrangler dev (:8787) and through the proxy, so it is Workers/WebSocket behaviour, not the plugin. (3) Upgrade on a path the Worker does not route: destroyed, 1006 (the #15654 path; harmless for us). (4) 15s idle then relay: still open, relayed. (5) Editing src/worker.ts: 'hmr update virtual:cloudflare/worker-entry', open sockets NOT closed, old sockets still relay, new requests get the new code. (6) Reconnect after edit works.

Fallback, wrangler dev :8787 + Vite proxy :5174 (server.proxy '/parties' ws:true): 100/side 200 msgs 89ms, 1000/side 2000 msgs 446ms, direct :8787 100/side 76ms. All exit 0. It works too, about 3x faster per message than the plugin path (extra Node ws coupling hop), irrelevant at <=15 msg/s per phone. All dev servers and Chrome killed after the runs (lsof on 5173/5174/8787/9333 empty).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Decision: use the Cloudflare Vite plugin dev server (@cloudflare/vite-plugin 1.54.9, vite 8.3.0, wrangler 4.131.2) for local development. Do not run wrangler dev behind a Vite proxy.

Evidence (spikes/dev-websocket/, partyserver 0.5.10 Room DO, SQLite-backed, hibernate on, Node 24.14.1, macOS arm64): on the plugin dev server a node host and phone exchanged 200, 2000 and 10000 messages in strict ping-pong, all in order, exit 0, clean 1000 closes. A headless Chrome 152 host page and phone page exchanged 200 messages ('phone done sent=100 received=100', 'host received=100 sent=100'). The fallback (wrangler dev :8787 + Vite proxy :5174) also passed (200 and 2000 messages), so it stays available but adds a second process and proxy config for no gain.

workers-sdk#15654 is still OPEN and fix PR #15659 is unmerged (checked 2026-09-16). It does not block us: the plugin's upgrade listener forwards every upgrade without a 'vite*' subprotocol to the Worker and destroys the socket if the Worker returns none. That only kills WebSocket servers mounted on the Vite dev server itself (Vite DevTools, custom Vite plugins). Sockets the Worker accepts work, and the Vite HMR socket works alongside them.

Gotchas for CC-1.5 (scaffold) and CC-1.9 (relay):
1. Don't mount any other WebSocket server on the Vite dev server (no Vite DevTools, no dev-only WS plugins) until #15654 is fixed. All app sockets must be served by the Worker.
2. Don't use WebSocket subprotocols (e.g. a ticket in Sec-WebSocket-Protocol). partyserver doesn't echo the header, so the handshake fails with 1006 on the plugin and on wrangler dev alike. Put the ticket in the query string, or echo the header in the Worker.
3. An upgrade to a path the Worker doesn't route is destroyed (1006), not answered with 404. Clients see a 1006 for a wrong URL.
4. Editing Worker code hot-updates the worker entry without closing open sockets. Old sockets keep relaying and new requests get new code. Reconnect after DO changes when testing.
5. wrangler 4.131.2 wants @cloudflare/workers-types ^5 (partyserver accepts ^5.20260703.1). Use v5.
6. pnpm 11 blocks esbuild and workerd postinstall scripts by default, and 'pnpm run' then fails its deps check. Add allowBuilds: { esbuild: true, workerd: true } to pnpm-workspace.yaml.
7. The plugin path is about 3x slower per message than bare wrangler dev (1000/side 1.5s vs 0.45s locally). Irrelevant at our 15 msg/s cap, but don't benchmark relay latency on the dev server.
8. Local DO state lives in .wrangler/state/ next to the config. Gitignore it.
<!-- SECTION:FINAL_SUMMARY:END -->
