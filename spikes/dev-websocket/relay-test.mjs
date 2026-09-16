// Two clients ("host" and "phone") exchange messages through the Room Durable Object.
// Usage: node relay-test.mjs [baseUrl] [messagesPerSide]
// Exits 0 only when every message arrived in order on the other side.
const base = process.argv[2] ?? "http://localhost:5173";
const perSide = Number(process.argv[3] ?? 100);
const room = `spike-${Date.now()}`;
const wsBase = base.replace(/^http/, "ws");

function open(role) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${wsBase}/parties/room/${room}?role=${role}`);
    const received = [];
    const timer = setTimeout(() => reject(new Error(`${role}: no welcome within 10s`)), 10_000);
    ws.addEventListener("message", (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === "welcome") {
        clearTimeout(timer);
        resolve({ ws, received, welcome: msg });
      } else received.push(msg);
    });
    ws.addEventListener("error", () => reject(new Error(`${role}: socket error`)));
    ws.addEventListener("close", (e) => console.log(`[${role}] close code=${e.code} reason=${e.reason}`));
  });
}

const started = performance.now();
const host = await open("host");
const phone = await open("phone");
console.log(`room=${room} host=${host.welcome.id} phone=${phone.welcome.id}`);

// Ping-pong: phone sends input i, host answers with state i. Strictly alternating, so order is checked too.
for (let i = 0; i < perSide; i++) {
  phone.ws.send(JSON.stringify({ type: "input", seq: i }));
  await waitFor(() => host.received.length === i + 1, `host to get input ${i}`);
  host.ws.send(JSON.stringify({ type: "state", seq: i }));
  await waitFor(() => phone.received.length === i + 1, `phone to get state ${i}`);
}

const ok =
  host.received.every((m, i) => m.type === "input" && m.seq === i) &&
  phone.received.every((m, i) => m.type === "state" && m.seq === i);
const ms = Math.round(performance.now() - started);
console.log(
  `sent=${perSide * 2} hostReceived=${host.received.length} phoneReceived=${phone.received.length} ordered=${ok} elapsedMs=${ms}`,
);
host.ws.close(1000, "done");
phone.ws.close(1000, "done");
await new Promise((r) => setTimeout(r, 200));
process.exit(ok && host.received.length === perSide && phone.received.length === perSide ? 0 : 1);

function waitFor(cond, what, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    (function poll() {
      if (cond()) return resolve();
      if (Date.now() - t0 > timeoutMs) return reject(new Error(`timeout waiting for ${what}`));
      setImmediate(poll);
    })();
  });
}
