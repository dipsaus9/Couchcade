import { expect, test } from "../src/fixtures.ts";
import { joinRoom, openRoom } from "../src/flows.ts";
import {
  cutLink,
  expectedLinkPath,
  framesOfType,
  linkPath,
  recordRelayFrames,
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
// wait below is generous. Chromium must always complete a direct connection -- `expectedLinkPath`
// requires it there, failing the test if it doesn't, since AC1 says the direct path must be shown,
// not merely attempted. Playwright's own WebKit build sometimes can't (realtime-link.md, "Playwright
// WebKit has no WebRTC") even though it exposes `RTCPeerConnection`, so only on webkit does
// `expectedLinkPath` observe the path the link actually settles on instead of requiring "direct",
// and the specs assert the relay path instead when direct never arrives there, or skip the case
// entirely when there is no connection to act on (AC4).

test.use({ hostSearch: "?link=1" });

test("a phone reaches the direct link and plays a full Target Range match with no input on the relay socket", async ({
  host,
  phones,
  browserName,
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

  await startMatch(host, ana, ben, code);
  const path = await expectedLinkPath(ana, browserName, 30_000);
  if (path !== "direct") {
    test.info().annotations.push({
      type: "note",
      description: "this engine never reached the direct link: asserting the relay path (AC4)",
    });
  }

  await playFullMatch(host, ana, ben);

  if (path === "direct") {
    // On the direct path, aim and shot samples travel over the data channel and never touch the
    // relay socket: no `input` frame should have gone out on it during the whole match.
    expect(framesOfType(anaFrames.sent, "input")).toHaveLength(0);
    expect(await linkPath(ana)).toBe("direct");
  }
});

test("cutting the link moves the phone to relay within 1 second and the match still completes", async ({
  host,
  phones,
  browserName,
}) => {
  test.setTimeout(240_000);

  const code = await openRoom(host);
  const [ana] = await phones(1, { motion: { permission: "denied" }, search: "?link=1" });
  const [ben] = await phones(1, { motion: { permission: "granted" }, search: "?link=1" });
  if (!ana || !ben) throw new Error("expected two phones");

  await startMatch(host, ana, ben, code);
  const path = await expectedLinkPath(ana, browserName, 30_000);
  test.skip(path !== "direct", "this engine never reached the direct link: nothing to cut (AC4)");

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
  browserName,
}) => {
  test.setTimeout(120_000);

  const code = await openRoom(host);
  let frames: { sent: RelayFrame[]; received: RelayFrame[] } | undefined;
  const [ana] = await phones(1, {
    search: "?link=1",
    beforeLoad: (page) => {
      frames = recordRelayFrames(page);
    },
  });
  if (!ana || !frames) throw new Error("expected a phone");

  await joinRoom(ana, code, "Ana");
  const path = await expectedLinkPath(ana, browserName, 30_000);
  if (path !== "direct") {
    test.info().annotations.push({
      type: "note",
      description: "this engine never reached the direct link: asserting the relay path (AC4)",
    });
  }

  const sinceIndex = frames.received.length;
  await host.reload();

  await waitForHostConnected(ana, frames, true, sinceIndex, 30_000);
  await waitForLinkPath(ana, path, 30_000);
});
