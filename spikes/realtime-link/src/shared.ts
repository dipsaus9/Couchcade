// Shared helpers for the CC-3.13 spike pages (tv.ts, phone.ts). Throwaway code:
// the production description codec and link state machine belong to CC-3.16;
// this only measures what the doc's rollout decision needs.

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return NaN;
  const idx = Math.min(sortedAsc.length - 1, Math.floor((p / 100) * sortedAsc.length));
  return sortedAsc[idx];
}

export function bytesOf(text: string): number {
  return new TextEncoder().encode(text).length;
}

export function fmtMs(n: number): string {
  return Number.isFinite(n) ? `${Math.round(n)}ms` : "n/a";
}

export interface CompactDescription {
  u: string;
  p: string;
  f: string;
  c: [foundation: string, priority: number, address: string, port: number, type: "host"][];
}

/**
 * A size-only re-creation of docs/architecture/realtime-link.md's compact
 * LinkDescription: ICE ufrag/password, the DTLS fingerprint as base64url, and
 * up to 6 UDP host candidates. This harness signals with the browser's own
 * full SDP (setLocalDescription/setRemoteDescription) -- it never rebuilds a
 * session description from this, so a parsing quirk here can't break the
 * connection. Building and testing the real codec is CC-3.16's job.
 */
export function toCompactDescription(sdp: string): CompactDescription {
  const ufrag = /^a=ice-ufrag:(\S+)/m.exec(sdp)?.[1] ?? "";
  const pwd = /^a=ice-pwd:(\S+)/m.exec(sdp)?.[1] ?? "";
  const fingerprintHex = /^a=fingerprint:sha-256 ([0-9A-Fa-f:]+)/m.exec(sdp)?.[1] ?? "";
  const fingerprintBytes = Uint8Array.from(
    fingerprintHex
      .split(":")
      .filter(Boolean)
      .map((h) => Number.parseInt(h, 16)),
  );

  const c: CompactDescription["c"] = [];
  const candidateLines = sdp.match(/^a=candidate:.+$/gm) ?? [];
  for (const line of candidateLines) {
    if (c.length >= 6) break;
    // a=candidate:<foundation> <component> <transport> <priority> <address> <port> typ <type> ...
    const parts = line.slice("a=candidate:".length).split(" ");
    const [foundation, , transport, priority, address, port, , type] = parts;
    if (transport?.toUpperCase() !== "UDP" || type !== "host") continue;
    c.push([foundation, Number(priority), address, Number(port), "host"]);
  }

  return { u: ufrag, p: pwd, f: base64url(fingerprintBytes), c };
}

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** iceServers: [] per the doc's owner decision 1 -- no STUN, no TURN. */
export const RTC_CONFIG: RTCConfiguration = { iceServers: [] };

/** Same shape as production's negotiated channels (Channels, messages and rates). */
export function createLinkChannels(pc: RTCPeerConnection) {
  const stream = pc.createDataChannel("cc-stream", {
    negotiated: true,
    id: 0,
    ordered: false,
    maxRetransmits: 0,
  });
  const events = pc.createDataChannel("cc-events", { negotiated: true, id: 1 });
  return { stream, events };
}

export function bothOpen(...channels: RTCDataChannel[]): boolean {
  return channels.every((c) => c.readyState === "open");
}

/** Candidates are gathered in one go (doc, "Compact descriptions" rule 6), capped so a stalled
 *  gatherer never blocks the offer/answer past what the doc calls "at most 1,000 ms". */
export function waitIceGatheringComplete(pc: RTCPeerConnection, capMs: number): Promise<void> {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, capMs);
    pc.addEventListener("icegatheringstatechange", function onChange() {
      if (pc.iceGatheringState === "complete") {
        clearTimeout(timer);
        pc.removeEventListener("icegatheringstatechange", onChange);
        resolve();
      }
    });
  });
}

export interface SelectedPair {
  local?: string;
  remote?: string;
}

/** getStats() candidate-pair type, host vs peer-reflexive (doc, "What we measure"). */
export async function selectedCandidatePair(pc: RTCPeerConnection): Promise<SelectedPair | null> {
  const report = await pc.getStats();
  let pair: { localCandidateId?: string; remoteCandidateId?: string } | null = null;
  report.forEach((entry) => {
    if (entry.type === "candidate-pair" && entry.state === "succeeded" && entry.nominated !== false) {
      pair = entry as { localCandidateId?: string; remoteCandidateId?: string };
    }
  });
  if (!pair) return null;
  const result: SelectedPair = {};
  report.forEach((entry) => {
    if (entry.type === "local-candidate" && entry.id === pair?.localCandidateId) {
      result.local = entry.candidateType;
    }
    if (entry.type === "remote-candidate" && entry.id === pair?.remoteCandidateId) {
      result.remote = entry.candidateType;
    }
  });
  return result;
}
