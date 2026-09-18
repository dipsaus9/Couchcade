import type { Page } from "@playwright/test";

// The real-time link's E2E harness (docs/architecture/realtime-link.md, "Testing"). E2E can't reach
// the `RTCPeerConnection` inside `apps/controller/src/runtime/link.ts` directly, so
// `apps/controller/src/runtime/link-test-hook.ts` puts the phone's `ControllerLink` on
// `window.__couchcadeLink` in dev and test builds: this module reads its `path` and calls `cut()`,
// the same pattern e2e/src/motion.ts uses for the fake sensor adapter (e2e/README.md, "Motion
// sensors"). Both apps' link switch defaults off (`link-switch.ts`), so a spec that wants the link
// opens the TV and its phones with `?link=1` (src/fixtures.ts, `hostSearch` and `PhoneOptions.search`).

/** The global the controller sets: `window.__couchcadeLink`. */
export const linkHookName = "__couchcadeLink";

/** What every `InputChannel` reports as its path (`InputChannelPath`, `@couchcade/game-sdk/contract`):
 * "off" outside a room or while the page is hidden, "relay" while switched off, unsupported or not
 * yet (or no longer) `direct`, and "direct" once the peer connection's data channels are open. */
export type LinkPath = "off" | "direct" | "relay";

/** `window`, seen as a record so the hook is read by name inside the page (as e2e/src/motion.ts
 * does for its own hook). */
type LinkHookWindow = Record<string, { path: LinkPath; cut(): void } | undefined>;

/** The phone's current link path, or null before the controller has wired the hook. */
export function linkPath(phone: Page): Promise<LinkPath | null> {
  return phone.evaluate(
    (name) => (window as unknown as LinkHookWindow)[name]?.path ?? null,
    linkHookName,
  );
}

/** Waits until the phone's link reaches `path`. */
export async function waitForLinkPath(
  phone: Page,
  path: LinkPath,
  timeoutMs = 20_000,
): Promise<void> {
  await phone.waitForFunction(
    ([name, expected]) => (window as unknown as LinkHookWindow)[name]?.path === expected,
    [linkHookName, path] as const,
    { timeout: timeoutMs },
  );
}

/** Cuts the phone's current connection as if it dropped, through the test hook (AC2). A no-op with
 * no open connection. */
export async function cutLink(phone: Page): Promise<void> {
  await phone.evaluate((name) => (window as unknown as LinkHookWindow)[name]?.cut(), linkHookName);
}

/**
 * Whether this page's browser engine can build an `RTCPeerConnection` at all (realtime-link.md,
 * "Playwright WebKit has no WebRTC"). Chromium always can; Playwright's own WebKit build sometimes
 * can't, so the specs branch on this instead of hard-coding the expected path per project (AC4).
 */
export function supportsRtc(phone: Page): Promise<boolean> {
  return phone.evaluate(() => typeof RTCPeerConnection === "function");
}

export interface RelayFrame {
  t: string;
  d: Record<string, unknown>;
}

/** Every JSON frame a page sends and receives on its relay sockets (`/ws/<code>`), from now on
 * (the same technique platform/host-recovery.spec.ts uses for its own checks). */
export function recordRelayFrames(page: Page): { sent: RelayFrame[]; received: RelayFrame[] } {
  const frames = { sent: [] as RelayFrame[], received: [] as RelayFrame[] };
  const parse = (payload: string | Buffer): RelayFrame | null =>
    typeof payload === "string" && payload.startsWith("{")
      ? (JSON.parse(payload) as RelayFrame)
      : null;
  page.on("websocket", (socket) => {
    if (!new URL(socket.url()).pathname.startsWith("/ws/")) return;
    socket.on("framesent", ({ payload }) => {
      const frame = parse(payload);
      if (frame) frames.sent.push(frame);
    });
    socket.on("framereceived", ({ payload }) => {
      const frame = parse(payload);
      if (frame) frames.received.push(frame);
    });
  });
  return frames;
}

/** The frames of type `t` in `frames`. */
export function framesOfType(frames: readonly RelayFrame[], t: string): RelayFrame[] {
  return frames.filter((frame) => frame.t === t);
}

/**
 * Waits until a `room:host` frame with `connected` arrives at index `sinceIndex` or later in
 * `frames.received`, the way a phone learns the TV came back (AC3). Pass the frame count at the
 * moment of the reload as `sinceIndex`, so an earlier `connected: true` from the initial join
 * doesn't satisfy the wait.
 */
export async function waitForHostConnected(
  phone: Page,
  frames: { received: RelayFrame[] },
  connected: boolean,
  sinceIndex: number,
  timeoutMs = 20_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const seen = framesOfType(frames.received.slice(sinceIndex), "room:host").some(
      (frame) => frame.d["connected"] === connected,
    );
    if (seen) return;
    await phone.waitForTimeout(50);
  }
  throw new Error(`no room:host { connected: ${connected} } frame arrived within ${timeoutMs}ms`);
}
