// Local sanity check (not the owner run): opens /tv and /phone as two tabs in
// a Chrome started with --remote-debugging-port, taps Start on the phone tab,
// and asserts the link connects and starts exchanging round trips. It does
// NOT wait out the full 60s phase run -- that's what the owner's real run
// measures on an iPhone. Usage: node browser-test.mjs [baseUrl] [devtoolsPort]
const base = process.argv[2] ?? "http://localhost:5199";
const devtools = `http://127.0.0.1:${process.argv[3] ?? 9313}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function openTab(url) {
  const target = await (await fetch(`${devtools}/json/new?${encodeURI(url)}`, { method: "PUT" })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r, { once: true }));
  let id = 0;
  const pending = new Map();
  ws.addEventListener("message", (e) => {
    const msg = JSON.parse(e.data);
    pending.get(msg.id)?.(msg.result);
  });
  const evaluate = (expression) =>
    new Promise((resolve) => {
      pending.set(++id, (res) => resolve(res?.result?.value));
      ws.send(JSON.stringify({ id, method: "Runtime.evaluate", params: { expression, awaitPromise: false } }));
    });
  return { evaluate, close: () => ws.close(), id: target.id };
}

const tv = await openTab(`${base}/tv`);
await sleep(1000);
const phone = await openTab(`${base}/phone`);
await sleep(500);
await phone.evaluate(`document.querySelector('#start').click()`);

let phoneStatus = "";
let phoneLive = "";
for (let i = 0; i < 30; i++) {
  await sleep(500);
  phoneStatus = (await phone.evaluate(`document.querySelector('#status')?.textContent`)) ?? "";
  phoneLive = (await phone.evaluate(`document.querySelector('#live')?.textContent`)) ?? "";
  // "Connected in …" is transient (the phone moves straight into "Running …/s…"),
  // so treat a round trip landing in #live as the proof the link is open and echoing.
  if (phoneLive.includes("round trip")) break;
}
const tvStatus = (await tv.evaluate(`document.querySelector('#status')?.textContent`)) ?? "";

console.log(`phone status: ${phoneStatus}`);
console.log(`phone live:   ${phoneLive}`);
console.log(`tv status:    ${tvStatus}`);

const ok = phoneLive.includes("round trip") && tvStatus.includes("Connected");
tv.close();
phone.close();
process.exit(ok ? 0 : 1);
