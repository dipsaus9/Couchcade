import { describe, expect, it } from "vitest";
import {
  decodeDescription,
  encodeDescription,
  frameBytesOf,
  maxCandidates,
  maxFrameBytes,
} from "@couchcade/game-sdk/link";
import type { LinkDescription } from "@couchcade/game-sdk/link";
import { chrome, firefox, recorded, safari } from "./fixtures/recorded.ts";

describe("encodeDescription", () => {
  it.each(Object.entries(recorded))("extracts u, p and a 43-character f from %s", (_name, pair) => {
    const offer = encodeDescription(pair.offerSdp);
    expect(offer.u.length).toBeGreaterThan(0);
    expect(offer.p.length).toBeGreaterThan(0);
    expect(offer.f).toHaveLength(43);
    expect(offer.f).toMatch(/^[\w-]+$/);
  });

  it("keeps Chrome's one UDP host candidate", () => {
    const offer = encodeDescription(chrome.offerSdp);
    expect(offer.c).toEqual([
      ["2283994475", 2113937151, "f692ad69-9e69-4aac-aaaa-41175088c4db.local", 55638, "host"],
    ]);
  });

  it("drops Firefox's TCP candidate and keeps only the UDP host one", () => {
    const offer = encodeDescription(firefox.offerSdp);
    expect(offer.c).toHaveLength(1);
    expect(offer.c[0]?.[4]).toBe("host");
    expect(firefox.offerSdp).toContain("TCP");
  });

  it("round-trips an empty candidate list (WebKit gathered none in this sandbox)", () => {
    const offer = encodeDescription(safari.offerSdp);
    expect(offer.c).toEqual([]);
  });

  it("keeps only component-1 candidates", () => {
    const sdp = withCandidateLines([
      "a=candidate:1 1 udp 100 1.local 1000 typ host",
      "a=candidate:2 2 udp 100 2.local 1000 typ host",
    ]);
    const desc = encodeDescription(sdp);
    expect(desc.c).toHaveLength(1);
    expect(desc.c[0]?.[2]).toBe("1.local");
  });

  it("truncates past 6 candidates, keeping the first 6 in order", () => {
    const lines = Array.from(
      { length: 8 },
      (_, i) => `a=candidate:${i} 1 udp ${1000 - i} host${i}.local ${5000 + i} typ host`,
    );
    const desc = encodeDescription(withCandidateLines(lines));
    expect(desc.c).toHaveLength(maxCandidates);
    expect(desc.c.map(([foundation]) => foundation)).toEqual(["0", "1", "2", "3", "4", "5"]);
  });

  it("throws when ice-ufrag, ice-pwd or the fingerprint is missing", () => {
    expect(() => encodeDescription("v=0\r\ns=-\r\n")).toThrow(/ice-ufrag|ice-pwd|fingerprint/);
  });
});

describe("frameBytesOf", () => {
  it.each(Object.entries(recorded))(
    "keeps every recorded %s frame under the 1 KB cap",
    (_name, pair) => {
      for (const sdp of [pair.offerSdp, pair.answerSdp]) {
        expect(frameBytesOf(encodeDescription(sdp))).toBeLessThan(maxFrameBytes);
      }
    },
  );

  it("stays under the cap even with the maximum 6 candidates", () => {
    const lines = Array.from(
      { length: 6 },
      (_, i) =>
        `a=candidate:${1_000_000 + i} 1 udp ${2_000_000_000 - i} host-fixture-${i}-abcdef01234567890.local ${50_000 + i} typ host`,
    );
    const desc = encodeDescription(withCandidateLines(lines));
    expect(desc.c).toHaveLength(6);
    expect(frameBytesOf(desc)).toBeLessThan(maxFrameBytes);
  });
});

describe("decodeDescription", () => {
  it.each(["offer", "answer"] as const)("sets a=setup for a rebuilt %s", (role) => {
    const desc = encodeDescription(chrome.offerSdp);
    const rebuilt = decodeDescription(desc, role);
    expect(rebuilt.type).toBe(role);
    expect(rebuilt.sdp).toContain(`a=setup:${role === "offer" ? "actpass" : "active"}`);
    expect(rebuilt.sdp).toContain("a=mid:0");
    expect(rebuilt.sdp).toContain("a=sctp-port:5000");
    expect(rebuilt.sdp).toContain("a=max-message-size:65536");
  });

  it.each(Object.entries(recorded))("round-trips %s through decode and back", (_name, pair) => {
    for (const [sdp, role] of [
      [pair.offerSdp, "offer"],
      [pair.answerSdp, "answer"],
    ] as const) {
      const encoded = encodeDescription(sdp);
      const rebuilt = decodeDescription(encoded, role);
      expect(encodeDescription(rebuilt.sdp)).toEqual(encoded);
    }
  });

  it("round-trips a description with 6 candidates", () => {
    const lines = Array.from(
      { length: 6 },
      (_, i) => `a=candidate:${i} 1 udp ${900 - i} host${i}.local ${6000 + i} typ host`,
    );
    const encoded = encodeDescription(withCandidateLines(lines));
    const roundTripped = encodeDescription(decodeDescription(encoded, "offer").sdp);
    expect(roundTripped).toEqual(encoded satisfies LinkDescription);
  });
});

function withCandidateLines(candidateLines: readonly string[]): string {
  return [
    "v=0",
    "o=- 1 2 IN IP4 127.0.0.1",
    "s=-",
    "t=0 0",
    "a=group:BUNDLE 0",
    "m=application 9 UDP/DTLS/SCTP webrtc-datachannel",
    "c=IN IP4 0.0.0.0",
    ...candidateLines,
    "a=ice-ufrag:test-ufrag",
    "a=ice-pwd:test-password-1234567890",
    "a=fingerprint:sha-256 AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99",
    "a=setup:actpass",
    "a=mid:0",
    "a=sctp-port:5000",
    "a=max-message-size:65536",
    "",
  ].join("\r\n");
}
