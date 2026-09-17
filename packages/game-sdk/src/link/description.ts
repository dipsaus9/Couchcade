/**
 * Compact WebRTC session description codec, from docs/architecture/realtime-link.md, "Compact
 * descriptions". A full session description with candidates is often over 1 KB, and the room
 * drops anything over 1 KB before parsing (platform.md, security.md), so both sides send only the
 * parts that differ per connection and rebuild the description from a fixed template.
 *
 * With `iceServers: []` (owner answer 1) a browser only ever gathers host candidates, so this
 * never parses or emits any other candidate type. Pure text in, text out: no `RTCPeerConnection`,
 * so it runs the same in the browser wiring and in tests.
 */

/** One UDP host ICE candidate, as sent over the wire. */
export type LinkCandidate = readonly [
  foundation: string,
  priority: number,
  address: string,
  port: number,
  type: "host",
];

/** The compact session description carried by `rtc:offer` and `rtc:answer`. */
export interface LinkDescription {
  /** ICE username fragment. */
  readonly u: string;
  /** ICE password. */
  readonly p: string;
  /** SHA-256 DTLS certificate fingerprint, 32 bytes as base64url (43 characters). */
  readonly f: string;
  /** UDP host candidates, at most `maxCandidates`. */
  readonly c: readonly LinkCandidate[];
}

/** Most candidates a description carries. The encoder drops any past this from the end. */
export const maxCandidates = 6;
/** The room's message cap (platform.md, security.md): every encoded frame must stay under this. */
export const maxFrameBytes = 1_024;

/** `"offer"` uses `a=setup:actpass`, `"answer"` uses `a=setup:active` (rule 1). */
export type LinkRole = "offer" | "answer";

/** A rebuilt session description, ready for `RTCPeerConnection.setLocalDescription`/`setRemoteDescription`. */
export interface DecodedDescription {
  readonly type: LinkRole;
  readonly sdp: string;
}

class LinkDescriptionError extends Error {}

/**
 * Extracts `u`, `p`, `f` and the UDP host candidates from a full SDP string, as produced by
 * `RTCPeerConnection.localDescription.sdp` after ICE gathering completes.
 *
 * Throws if the ICE username fragment, password or a `sha-256` fingerprint is missing: those
 * three are required for any WebRTC description and their absence means the input isn't one.
 * TCP candidates and candidates that aren't `typ host` or component 1 are skipped; the list stops
 * at `maxCandidates`, dropping the rest.
 */
export function encodeDescription(sdp: string): LinkDescription {
  const ufrag = firstMatch(sdp, /^a=ice-ufrag:(\S+)/m);
  const pwd = firstMatch(sdp, /^a=ice-pwd:(\S+)/m);
  const fingerprintHex = firstMatch(sdp, /^a=fingerprint:sha-256 ([0-9A-Fa-f:]+)/m);
  if (ufrag === null || pwd === null || fingerprintHex === null) {
    throw new LinkDescriptionError(
      "link: description is missing ice-ufrag, ice-pwd or a sha-256 fingerprint",
    );
  }

  const candidates: LinkCandidate[] = [];
  const candidateLine = /^a=candidate:(\S+) (\d+) (\S+) (\d+) (\S+) (\d+) typ (\S+)/gm;
  for (const match of sdp.matchAll(candidateLine)) {
    if (candidates.length >= maxCandidates) break;
    const [, foundation, component, transport, priority, address, port, type] = match;
    if (component !== "1" || transport?.toLowerCase() !== "udp" || type !== "host") continue;
    candidates.push([
      foundation as string,
      Number(priority),
      address as string,
      Number(port),
      "host",
    ]);
  }

  return { u: ufrag, p: pwd, f: hexFingerprintToCompact(fingerprintHex), c: candidates };
}

/**
 * Rebuilds a full session description from the fixed template (rule 1): one
 * `m=application 9 UDP/DTLS/SCTP webrtc-datachannel` section with `a=mid:0`, `a=sctp-port:5000`
 * and `a=max-message-size:65536`, `a=setup:actpass` for an offer and `a=setup:active` for an
 * answer.
 */
export function decodeDescription(desc: LinkDescription, role: LinkRole): DecodedDescription {
  const candidateLines = desc.c
    .slice(0, maxCandidates)
    .map(
      ([foundation, priority, address, port]) =>
        `a=candidate:${foundation} 1 udp ${priority} ${address} ${port} typ host generation 0`,
    );

  const lines = [
    "v=0",
    "o=- 0 2 IN IP4 127.0.0.1",
    "s=-",
    "t=0 0",
    "a=group:BUNDLE 0",
    "a=msid-semantic: WMS",
    "m=application 9 UDP/DTLS/SCTP webrtc-datachannel",
    "c=IN IP4 0.0.0.0",
    ...candidateLines,
    `a=ice-ufrag:${desc.u}`,
    `a=ice-pwd:${desc.p}`,
    "a=ice-options:trickle",
    `a=fingerprint:sha-256 ${compactToHexFingerprint(desc.f)}`,
    `a=setup:${role === "offer" ? "actpass" : "active"}`,
    "a=mid:0",
    "a=sctp-port:5000",
    "a=max-message-size:65536",
    "",
  ];
  return { type: role, sdp: lines.join("\r\n") };
}

/** The size an encoded description takes as a JSON frame, to check it against `maxFrameBytes`. */
export function frameBytesOf(desc: LinkDescription): number {
  return textEncoder.encode(JSON.stringify(desc)).length;
}

function firstMatch(text: string, pattern: RegExp): string | null {
  return pattern.exec(text)?.[1] ?? null;
}

// The lib tsconfig has no DOM types (packages/config/tsconfig/lib.json), so `TextEncoder`,
// `btoa` and `atob` are declared ambient here, the same way room-clock.ts casts `globalThis` for
// `performance` and `setTimeout`. All three exist in browsers, Workers and Node.
interface EncodingGlobals {
  TextEncoder: new () => { encode(input: string): Uint8Array };
  btoa(data: string): string;
  atob(data: string): string;
}
const encodingGlobals = globalThis as unknown as EncodingGlobals;
const textEncoder = new encodingGlobals.TextEncoder();

function hexFingerprintToCompact(hexColons: string): string {
  return bytesToBase64Url(hexColonsToBytes(hexColons));
}

function compactToHexFingerprint(base64Url: string): string {
  return bytesToHexColons(base64UrlToBytes(base64Url));
}

function hexColonsToBytes(hex: string): Uint8Array {
  const clean = hex.replaceAll(":", "");
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(clean.slice(2 * i, 2 * i + 2), 16);
  }
  return bytes;
}

function bytesToHexColons(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0").toUpperCase()).join(":");
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return encodingGlobals.btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = encodingGlobals.atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
