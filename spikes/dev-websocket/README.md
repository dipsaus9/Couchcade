# Spike CC-1.3: app WebSockets on the local dev server

Throwaway prototype. It answers one question: can the host and a phone talk through a Durable Object on the Cloudflare Vite plugin dev server, given [workers-sdk#15654](https://github.com/cloudflare/workers-sdk/issues/15654)?

Answer: yes. The decision and evidence are in the CC-1.3 final summary in the backlog.

## What's here

| File | Role |
|---|---|
| `src/worker.ts` | Worker + `Room` Durable Object on partyserver (SQLite-backed, hibernation on). Relays every message to the other sockets in the room. |
| `vite.config.ts` | Candidate A: Vite with `@cloudflare/vite-plugin` |
| `vite.proxy.config.ts` | Candidate B (fallback): plain Vite proxying `/parties` and `/api` to `wrangler dev` |
| `index.html`, `src/page.ts` | Host page (`/?role=host&room=r1`) and phone page (`/?role=phone&room=r1&count=100`) |
| `relay-test.mjs` | Node host + phone clients, strict ping-pong, checks count and order |
| `browser-test.mjs` | Opens both pages in a Chrome started with `--remote-debugging-port` and reads their results |
| `edge-cases.mjs` | HMR socket next to app sockets, subprotocols, unrouted paths, idle, Worker edit |

## Run it

This folder is standalone (not part of a workspace).

```bash
pnpm install
pnpm dev                                  # candidate A on :5173
pnpm relay-test http://localhost:5173 100 # 200 messages, exits 0 on success
pnpm edge-cases http://localhost:5173     # edit src/worker.ts when it prints WAITING_FOR_EDIT

# Browser pages
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new \
  --remote-debugging-port=9333 --user-data-dir=/tmp/cc13-chrome about:blank &
pnpm browser-test http://localhost:5173 9333 100

# Candidate B
pnpm dev:wrangler & pnpm dev:proxy
pnpm relay-test http://localhost:5174 100
```
