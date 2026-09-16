// Opens the host page and the phone page as two tabs in a Chrome started with
// --remote-debugging-port, then reads each page's result over the DevTools protocol.
// Usage: node browser-test.mjs [baseUrl] [devtoolsPort] [count]
const base = process.argv[2] ?? "http://localhost:5173";
const devtools = `http://127.0.0.1:${process.argv[3] ?? 9333}`;
const count = Number(process.argv[4] ?? 100);
const room = `browser-${Date.now()}`;
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
      ws.send(JSON.stringify({ id, method: "Runtime.evaluate", params: { expression } }));
    });
  return { evaluate, close: () => ws.close() };
}

const readResult = (tab) => tab.evaluate(`document.querySelector("#result")?.textContent`);
const host = await openTab(`${base}/?role=host&room=${room}`);
await sleep(3000);
const phone = await openTab(`${base}/?role=phone&room=${room}&count=${count}`);
let phoneText = "";
for (let i = 0; i < 100 && !phoneText.startsWith("phone done"); i++) {
  await sleep(200);
  phoneText = (await readResult(phone)) ?? "";
}
const hostText = await readResult(host);
console.log(`room=${room}\nphone page: ${phoneText}\nhost page: ${hostText}`);
host.close();
phone.close();
process.exit(phoneText === `phone done sent=${count} received=${count}` ? 0 : 1);
