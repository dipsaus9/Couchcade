// Usage: node scripts/send-messages.mjs <worker-origin> <room> <count>
// Opens one WebSocket, sends <count> messages one at a time (next message after the ack)
// and prints a JSON summary with UTC timestamps for the analytics query.
const [origin, room, countArg] = process.argv.slice(2);
const count = Number(countArg);
if (!origin || !room || !Number.isInteger(count) || count < 1) {
  console.error("Usage: node scripts/send-messages.mjs <worker-origin> <room> <count>");
  process.exit(1);
}

const url = `${origin.replace(/^http/, "ws")}/ws?room=${encodeURIComponent(room)}`;
const socket = new WebSocket(url);
const startedAt = new Date().toISOString();
let sent = 0;
let acked = 0;

const sendNext = () => {
  sent += 1;
  socket.send(String(sent));
};

socket.addEventListener("open", sendNext);
socket.addEventListener("message", (event) => {
  if (event.data === `ack:${acked + 1}`) acked += 1;
  if (sent < count) sendNext();
  else socket.close(1000, "done");
});
socket.addEventListener("close", () => {
  console.log(JSON.stringify({ room, sent, acked, startedAt, finishedAt: new Date().toISOString() }));
  process.exit(acked === count ? 0 : 1);
});
socket.addEventListener("error", (event) => {
  console.error("WebSocket error", event.message ?? event);
  process.exit(1);
});
