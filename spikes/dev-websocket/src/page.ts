// Host page: /?role=host&room=r1 answers every phone input with a state message.
// Phone page: /?role=phone&room=r1&count=100 sends inputs one by one and waits for each answer.
const params = new URLSearchParams(location.search);
const role = params.get("role") === "host" ? "host" : "phone";
const room = params.get("room") ?? "demo";
const count = Number(params.get("count") ?? 100);
const result = document.querySelector("#result")!;
document.querySelector("#title")!.textContent = `${role} in room ${room}`;

const scheme = location.protocol === "https:" ? "wss" : "ws";
const ws = new WebSocket(`${scheme}://${location.host}/parties/room/${room}?role=${role}`);
let sent = 0;
let received = 0;

ws.addEventListener("close", (e) => (result.textContent += ` closed=${e.code}`));
ws.addEventListener("message", (event) => {
  const msg = JSON.parse(event.data);
  if (msg.type === "welcome") {
    result.textContent = `${role} connected`;
    if (role === "phone") send();
    return;
  }
  received++;
  if (role === "host" && msg.type === "input") {
    ws.send(JSON.stringify({ type: "state", seq: msg.seq }));
    sent++;
    result.textContent = `host received=${received} sent=${sent}`;
  }
  if (role === "phone" && msg.type === "state") {
    if (msg.seq !== received - 1) result.textContent = `phone out of order at ${msg.seq}`;
    else if (received === count) result.textContent = `phone done sent=${sent} received=${received}`;
    else send();
  }
});

function send() {
  ws.send(JSON.stringify({ type: "input", seq: sent }));
  sent++;
}
