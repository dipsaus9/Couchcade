// CC-3.13 spike, TV page. Answers whatever offer the phone posts to the local
// signalling mailbox, then echoes every stream sample back as a pong and
// moves a dot to the phone's reported position.
import { bothOpen, createLinkChannels, RTC_CONFIG, sleep, waitIceGatheringComplete } from "./shared";

const statusEl = document.querySelector<HTMLElement>("#status")!;
const dotEl = document.querySelector<HTMLElement>("#dot")!;
const logEl = document.querySelector<HTMLElement>("#log")!;

let lastOfferToken = 0;
let currentPc: RTCPeerConnection | null = null;

function log(line: string): void {
  const row = document.createElement("div");
  row.textContent = `${new Date().toLocaleTimeString()} — ${line}`;
  logEl.prepend(row);
  while (logEl.childElementCount > 20) logEl.lastChild?.remove();
}

function moveDot(x: number, y: number): void {
  const clampedX = Math.max(-140, Math.min(140, x));
  const clampedY = Math.max(-140, Math.min(140, y));
  dotEl.style.transform = `translate(${clampedX}px, ${clampedY}px)`;
}

async function handleOffer(offer: { attemptId: number; sdp: string }): Promise<void> {
  currentPc?.close();
  statusEl.textContent = "Answering…";

  const pc = new RTCPeerConnection(RTC_CONFIG);
  currentPc = pc;
  const { stream, events } = createLinkChannels(pc);

  stream.addEventListener("message", (e) => {
    const msg = JSON.parse(e.data as string) as { k: string; seq: number; hz: number; x: number; y: number };
    if (msg.k !== "pos") return;
    moveDot(msg.x, msg.y);
    try {
      stream.send(JSON.stringify({ k: "pong", seq: msg.seq, hz: msg.hz }));
    } catch {
      // Not writable right now; the phone counts the missing pong as a loss.
    }
  });
  events.addEventListener("message", (e) => {
    const msg = JSON.parse(e.data as string) as { k: string; label?: string };
    if (msg.k === "marker") log(`phone entered ${msg.label}`);
  });

  const onOpen = () => {
    if (bothOpen(stream, events)) statusEl.textContent = "Connected — link open";
  };
  stream.addEventListener("open", onOpen);
  events.addEventListener("open", onOpen);
  pc.addEventListener("connectionstatechange", () => log(`connection: ${pc.connectionState}`));
  pc.addEventListener("iceconnectionstatechange", () => log(`ice: ${pc.iceConnectionState}`));

  await pc.setRemoteDescription({ type: "offer", sdp: offer.sdp });
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  await waitIceGatheringComplete(pc, 1000);

  await fetch("/api/answer", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ attemptId: offer.attemptId, sdp: pc.localDescription!.sdp }),
  });
  log(`answered attempt ${offer.attemptId}`);
}

async function pollOffers(): Promise<void> {
  for (;;) {
    try {
      const res = await fetch(`/api/offer?since=${lastOfferToken}`);
      if (res.status === 200) {
        const body = (await res.json()) as { token: number; attemptId: number; sdp: string };
        lastOfferToken = body.token;
        await handleOffer(body);
      }
    } catch (err) {
      log(`poll error: ${err instanceof Error ? err.message : String(err)}`);
    }
    await sleep(300);
  }
}

statusEl.textContent = "Waiting for the phone…";
void pollOffers();
