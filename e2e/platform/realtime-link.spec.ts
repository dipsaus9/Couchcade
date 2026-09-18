import { expect, test } from "../src/fixtures.ts";
import { joinRoom, openRoom } from "../src/flows.ts";
import {
  cutLink,
  framesOfType,
  linkPath,
  recordRelayFrames,
  supportsRtc,
  waitForHostConnected,
  waitForLinkPath,
  type RelayFrame,
} from "../src/link.ts";
import { playFullMatch, startMatch, tvState } from "../src/target-range.ts";

// The real-time link's browser wiring (docs/architecture/realtime-link.md, "Testing"): a phone
// reaches the direct path, input flows over it, the link falls back to relay when it is cut, and
// the phone relinks after a TV reload. Both apps' link switch defaults off (`link-switch.ts`), so
// every test opens the TV and its phones with `?link=1` (src/fixtures.ts, `hostSearch` and
// `PhoneOptions.search`).
//
// WebRTC between two browser contexts on a GitHub-hosted runner can be slow to negotiate, so every
// wait below is generous. Chromium always exposes `RTCPeerConnection`; Playwright's own WebKit
// build sometimes doesn't (realtime-link.md, "Playwright WebKit has no WebRTC") -- these specs
// check for it at runtime with `supportsRtc` and assert the relay path instead when it's missing,
// or skip the case entirely when there is no connection to act on (AC4).

test.use({ hostSearch: "?link=1" });

test("a phone reaches the direct link and plays a full Target Range match with no input on the relay socket", async ({
  host,
  phones,
}) => {
  test.setTimeout(240_000);

  const code = await openRoom(host);
  let anaFrames: { sent: RelayFrame[]; received: RelayFrame[] } | undefined;
  const [ana] = await phones(1, {
    motion: { permission: "denied" },
    search: "?link=1",
    beforeLoad: (page) => {
      anaFrames = recordRelayFrames(page);
    },
  });
  const [ben] = await phones(1, { motion: { permission: "granted" }, search: "?link=1" });
  if (!ana || !ben || !anaFrames) throw new Error("expected two phones");

  const rtc = await supportsRtc(ana);
  const expectedPath = rtc ? "direct" : "relay";
  if (!rtc) {
    test.info().annotations.push({
      type: "note",
      description: "WebKit here has no RTCPeerConnection: asserting the relay path (AC4)",
    });
  }

  await startMatch(host, ana, ben, code);
  await waitForLinkPath(ana, expectedPath, 30_000);

  await playFullMatch(host, ana, ben);

  if (rtc) {
    // On the direct path, aim and shot samples travel over the data channel and never touch the
    // relay socket: no `input` frame should have gone out on it during the whole match.
    expect(framesOfType(anaFrames.sent, "input")).toHaveLength(0);
    expect(await linkPath(ana)).toBe("direct");
  }
});

test("cutting the link moves the phone to relay within 1 second and the match still completes", async ({
  host,
  phones,
}) => {
  test.setTimeout(240_000);

  const code = await openRoom(host);
  const [ana] = await phones(1, { motion: { permission: "denied" }, search: "?link=1" });
  const [ben] = await phones(1, { motion: { permission: "granted" }, search: "?link=1" });
  if (!ana || !ben) throw new Error("expected two phones");

  const rtc = await supportsRtc(ana);
  test.skip(!rtc, "WebKit here has no RTCPeerConnection: there is no direct link to cut (AC4)");

  await startMatch(host, ana, ben, code);
  await waitForLinkPath(ana, "direct", 30_000);

  let cutOnce = false;
  await playFullMatch(host, ana, ben, {
    beforeVolley: async (round, arrow) => {
      if (cutOnce || round !== 1 || arrow !== 1) return;
      cutOnce = true;
      const cutAt = Date.now();
      await cutLink(ana);
      await waitForLinkPath(ana, "relay", 1_000);
      expect(Date.now() - cutAt).toBeLessThan(1_000);
    },
  });

  const final = await tvState(host);
  expect(final?.phase).toBe("over");
});

test("a TV reload brings the phone's link back after room:host connected true", async ({
  host,
  phones,
}) => {
  test.setTimeout(60_000);

  const code = await openRoom(host);
  let frames: { sent: RelayFrame[]; received: RelayFrame[] } | undefined;
  const [ana] = await phones(1, {
    search: "?link=1",
    beforeLoad: (page) => {
      frames = recordRelayFrames(page);
    },
  });
  if (!ana || !frames) throw new Error("expected a phone");

  const rtc = await supportsRtc(ana);
  const expectedPath = rtc ? "direct" : "relay";
  if (!rtc) {
    test.info().annotations.push({
      type: "note",
      description: "WebKit here has no RTCPeerConnection: asserting the relay path (AC4)",
    });
  }

  await joinRoom(ana, code, "Ana");
  await waitForLinkPath(ana, expectedPath, 30_000);

  const sinceIndex = frames.received.length;
  await host.reload();

  await waitForHostConnected(ana, frames, true, sinceIndex, 30_000);
  await waitForLinkPath(ana, expectedPath, 15_000);
});
