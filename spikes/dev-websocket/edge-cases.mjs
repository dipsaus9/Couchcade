// Edge cases around workers-sdk#15654 and dev-loop behaviour.
// Usage: node edge-cases.mjs [baseUrl]
const base = process.argv[2] ?? "http://localhost:5173";
const wsBase = base.replace(/^http/, "ws");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function connect(path, protocols) {
  return new Promise((resolve) => {
    const ws = new WebSocket(`${wsBase}${path}`, protocols);
    const log = { opened: false, closeCode: null, messages: [] };
    ws.addEventListener("open", () => (log.opened = true));
    ws.addEventListener("message", (e) => log.messages.push(String(e.data)));
    ws.addEventListener("close", (e) => (log.closeCode = e.code));
    ws.addEventListener("error", () => {});
    setTimeout(() => resolve({ ws, log }), 1500);
  });
}

const room = `edge-${Date.now()}`;

// 1. Vite HMR socket (subprotocol vite-hmr) and app sockets on the same dev server at the same time.
const hmr = await connect("/", "vite-hmr");
const host = await connect(`/parties/room/${room}?role=host`);
const phone = await connect(`/parties/room/${room}?role=phone`);
phone.ws.send("hello-from-phone");
await sleep(300);
console.log(
  `1 coexist: hmr open=${hmr.log.opened} hmrMsgs=${hmr.log.messages.length} ` +
    `host open=${host.log.opened} got=${JSON.stringify(host.log.messages.at(-1))}`,
);

// 2. App socket carrying its own (non-vite) subprotocol still reaches the Worker.
const proto = await connect(`/parties/room/${room}?role=phone`, "couchcade.v1");
console.log(`2 subprotocol couchcade.v1: open=${proto.log.opened} close=${proto.log.closeCode} msgs=${proto.log.messages.length}`);

// 3. A socket on a path the Worker does not route (what #15654 is about: plugin forwards, gets 404, destroys).
const stray = await connect("/not-a-worker-route");
console.log(`3 unrouted path: open=${stray.log.opened} close=${stray.log.closeCode}`);

// 4. Idle for 15s (DO may hibernate), then relay again.
await sleep(15_000);
const before = host.log.messages.length;
phone.ws.send("after-idle");
await sleep(500);
console.log(`4 after 15s idle: host open=${host.ws.readyState === 1} newMsgs=${host.log.messages.length - before}`);

console.log("WAITING_FOR_EDIT"); // the driver edits src/worker.ts now
const t0 = Date.now();
while (host.log.closeCode === null && Date.now() - t0 < 5_000) await sleep(100);
const beforeEdit = host.log.messages.length;
phone.ws.send("after-edit");
await sleep(500);
const health = await (await fetch(`${base}/api/health`)).json();
console.log(`5b old sockets after edit: relayed=${host.log.messages.length - beforeEdit} health=${JSON.stringify(health)}`);
console.log(`5 after worker edit: host close=${host.log.closeCode} phone close=${phone.log.closeCode} hmr close=${hmr.log.closeCode} watchedMs=5000`);

// 6. Reconnect after the edit works.
const again = await connect(`/parties/room/${room}?role=host`);
console.log(`6 reconnect: open=${again.log.opened} welcome=${again.log.messages.length > 0}`);
for (const s of [hmr, host, phone, proto, again]) try { s.ws.close(); } catch {}
await sleep(200);
process.exit(0);
