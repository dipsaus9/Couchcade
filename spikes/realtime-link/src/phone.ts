// CC-3.13 spike, phone page. Offers a direct WebRTC link with iceServers: [],
// signals through the local Vite dev server's mailbox (vite.config.ts), then
// runs 30s at 30 messages/s and 30s at 60/s, treating every stream sample as
// its own ping: the TV echoes it back at once and this page measures the
// round trip on its own clock. Ends with a copyable plain-text summary.
import {
  bothOpen,
  bytesOf,
  createLinkChannels,
  fmtMs,
  percentile,
  RTC_CONFIG,
  selectedCandidatePair,
  sleep,
  toCompactDescription,
  waitIceGatheringComplete,
} from "./shared";

const statusEl = document.querySelector<HTMLElement>("#status")!;
const liveEl = document.querySelector<HTMLElement>("#live")!;
const startBtn = document.querySelector<HTMLButtonElement>("#start")!;
const copyBtn = document.querySelector<HTMLButtonElement>("#copy")!;
const summaryEl = document.querySelector<HTMLTextAreaElement>("#summary")!;
const networkSel = document.querySelector<HTMLSelectElement>("#network")!;
const deviceInput = document.querySelector<HTMLInputElement>("#device")!;

interface Phase {
  hz: number;
  durationMs: number;
  rtts: number[];
  sent: number;
  lost: number;
}

let attemptSeq = 0;
let motion = { x: 0, y: 0 };

window.addEventListener("devicemotion", (e) => {
  const g = e.accelerationIncludingGravity;
  if (g && (g.x !== null || g.y !== null)) motion = { x: (g.x ?? 0) * 10, y: (g.y ?? 0) * 10 };
});

function syntheticPosition(t: number) {
  // Keeps the TV dot moving even without a motion sensor (denied permission,
  // or this page opened on a laptop tab for the local two-tab check).
  return { x: Math.sin(t / 900) * 50, y: Math.cos(t / 700) * 50 };
}

async function requestMotionPermission(): Promise<void> {
  const ctor = window.DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> };
  if (typeof ctor.requestPermission === "function") {
    try {
      await ctor.requestPermission();
    } catch {
      // Denied or unsupported: syntheticPosition() covers movement instead.
    }
  }
}

async function negotiate(pc: RTCPeerConnection, isCancelled: () => boolean): Promise<string> {
  const attemptId = Date.now() * 1000 + attemptSeq++;
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await waitIceGatheringComplete(pc, 1000);
  const sdp = pc.localDescription!.sdp;

  await fetch("/api/offer", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ attemptId, sdp }),
  });

  let since = 0;
  while (!isCancelled()) {
    const res = await fetch(`/api/answer?since=${since}&attemptId=${attemptId}`);
    if (res.status === 200) {
      const body = (await res.json()) as { token: number; sdp: string };
      since = body.token;
      await pc.setRemoteDescription({ type: "answer", sdp: body.sdp });
      return sdp;
    }
    await sleep(150);
  }
  throw new Error("cancelled");
}

async function runPhase(stream: RTCDataChannel, phase: Phase): Promise<void> {
  const intervalMs = 1000 / phase.hz;
  const pending = new Map<number, number>();
  let seq = 0;
  const phaseEnd = performance.now() + phase.durationMs;

  const onMessage = (e: MessageEvent) => {
    const msg = JSON.parse(e.data as string) as { k: string; seq: number; hz: number };
    if (msg.k !== "pong" || msg.hz !== phase.hz) return;
    const sentAt = pending.get(msg.seq);
    if (sentAt === undefined) return;
    pending.delete(msg.seq);
    const rtt = performance.now() - sentAt;
    phase.rtts.push(rtt);
    liveEl.textContent = `${phase.hz}/s — last round trip ${fmtMs(rtt)}, ${pending.size} in flight`;
  };
  stream.addEventListener("message", onMessage);

  while (performance.now() < phaseEnd) {
    const t = performance.now();
    const pos = motion.x !== 0 || motion.y !== 0 ? motion : syntheticPosition(t);
    pending.set(seq, t);
    phase.sent += 1;
    try {
      stream.send(JSON.stringify({ k: "pos", seq, hz: phase.hz, x: pos.x, y: pos.y }));
    } catch {
      // Channel not writable right now; the reply never arrives, counted as loss below.
    }
    seq += 1;
    await sleep(intervalMs);
  }
  await sleep(500); // let in-flight pongs land before scoring the phase
  stream.removeEventListener("message", onMessage);
  phase.lost = pending.size;
}

interface FinishArgs {
  connected: boolean;
  reason?: string;
  connectMs?: number;
  offerSdp: string;
  answerSdp: string | null;
  phases: Phase[];
  device: string;
  network: string;
  tStart: number;
  pc?: RTCPeerConnection;
}

async function buildSummary(args: FinishArgs): Promise<string> {
  const lines: string[] = [];
  lines.push(`Realtime-link spike (CC-3.13) — ${args.device} on ${args.network}`);
  lines.push(`Connected: ${args.connected ? "yes" : "no"}${args.reason ? ` (${args.reason})` : ""}`);
  if (!args.connected) return lines.join("\n");

  lines.push(`Time to connect: ${fmtMs(args.connectMs ?? NaN)}`);
  const compactOffer = toCompactDescription(args.offerSdp);
  lines.push(`Offer size: full=${bytesOf(args.offerSdp)}B compact=${bytesOf(JSON.stringify(compactOffer))}B`);
  if (args.answerSdp) {
    const compactAnswer = toCompactDescription(args.answerSdp);
    lines.push(`Answer size: full=${bytesOf(args.answerSdp)}B compact=${bytesOf(JSON.stringify(compactAnswer))}B`);
  }
  if (args.pc) {
    const pair = await selectedCandidatePair(args.pc);
    lines.push(`Candidate pair: local=${pair?.local ?? "unknown"} remote=${pair?.remote ?? "unknown"}`);
  }
  for (const phase of args.phases) {
    const sorted = [...phase.rtts].sort((a, b) => a - b);
    const lossPer100 = phase.sent ? (phase.lost / phase.sent) * 100 : 0;
    lines.push(
      `Round trip @${phase.hz}/s: p50=${fmtMs(percentile(sorted, 50))} p90=${fmtMs(percentile(sorted, 90))} ` +
        `(sent=${phase.sent}, lost=${phase.lost}, ${lossPer100.toFixed(2)}/100)`,
    );
  }
  return lines.join("\n");
}

async function run(): Promise<void> {
  startBtn.disabled = true;
  copyBtn.disabled = true;
  summaryEl.value = "";
  liveEl.textContent = "";
  const network = networkSel.value;
  const device = deviceInput.value.trim() || "iPhone";
  const tStart = performance.now();

  await requestMotionPermission();

  const pc = new RTCPeerConnection(RTC_CONFIG);
  const { stream, events } = createLinkChannels(pc);

  let connected = false;
  let cancelled = false;

  const finish = (args: FinishArgs) => {
    void buildSummary(args).then((text) => {
      summaryEl.value = text;
      copyBtn.disabled = false;
      startBtn.disabled = false;
    });
  };

  const deadline = setTimeout(() => {
    if (connected) return;
    cancelled = true;
    statusEl.textContent = "Not connected (timed out after 5s)";
    pc.close();
    finish({
      connected: false,
      reason: "timed out after 5s",
      offerSdp: pc.localDescription?.sdp ?? "",
      answerSdp: null,
      phases: [],
      device,
      network,
      tStart,
    });
  }, 5000);

  let connectMs = NaN;
  const maybeConnected = () => {
    if (connected || cancelled || !bothOpen(stream, events)) return;
    connected = true;
    clearTimeout(deadline);
    connectMs = performance.now() - tStart;
    statusEl.textContent = `Connected in ${fmtMs(connectMs)}`;
    void startPhases();
  };
  stream.addEventListener("open", maybeConnected);
  events.addEventListener("open", maybeConnected);

  const phases: Phase[] = [
    { hz: 30, durationMs: 30_000, rtts: [], sent: 0, lost: 0 },
    { hz: 60, durationMs: 30_000, rtts: [], sent: 0, lost: 0 },
  ];

  async function startPhases() {
    for (const phase of phases) {
      events.send(JSON.stringify({ k: "marker", label: `phase-${phase.hz}hz` }));
      statusEl.textContent = `Running ${phase.hz} messages/s…`;
      await runPhase(stream, phase);
    }
    statusEl.textContent = "Done — results ready to copy";
    finish({
      connected: true,
      connectMs,
      offerSdp: pc.localDescription?.sdp ?? "",
      answerSdp: pc.currentRemoteDescription?.sdp ?? null,
      phases,
      device,
      network,
      tStart,
      pc,
    });
  }

  statusEl.textContent = "Connecting…";
  try {
    await negotiate(pc, () => cancelled);
  } catch {
    if (!cancelled) {
      cancelled = true;
      clearTimeout(deadline);
      statusEl.textContent = "Not connected (no answer)";
      finish({
        connected: false,
        reason: "no answer from the TV page",
        offerSdp: pc.localDescription?.sdp ?? "",
        answerSdp: null,
        phases: [],
        device,
        network,
        tStart,
      });
    }
  }
}

startBtn.addEventListener("click", () => void run());

copyBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(summaryEl.value);
    copyBtn.textContent = "Copied!";
  } catch {
    summaryEl.select();
    document.execCommand("copy");
    copyBtn.textContent = "Copied!";
  }
  setTimeout(() => (copyBtn.textContent = "Copy results"), 1500);
});
