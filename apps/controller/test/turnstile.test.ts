import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createTurnstile,
  turnstileRunTimeoutMs,
  turnstileSiteKey,
  turnstileTestSiteKey,
  type TurnstileApi,
  type TurnstileRenderOptions,
} from "../src/security/turnstile.ts";

const dummyToken = "XXXX.DUMMY.TOKEN.XXXX";

/** A stand-in for `window.turnstile`. `answer` decides what each run does. */
function fakeTurnstile(
  answer: (options: TurnstileRenderOptions) => void = (o) => o.callback(dummyToken),
) {
  let options: TurnstileRenderOptions | null = null;
  const api = {
    render: vi.fn<TurnstileApi["render"]>((_container, rendered) => {
      options = rendered;
      return "widget-1";
    }),
    execute: vi.fn<TurnstileApi["execute"]>(() => {
      if (options) answer(options);
    }),
    reset: vi.fn<TurnstileApi["reset"]>(),
  };
  const container = {} as HTMLElement;
  const provider = createTurnstile({
    action: "join",
    siteKey: turnstileTestSiteKey,
    load: async () => api,
    mount: () => container,
  });
  return { api, provider, container };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("createTurnstile", () => {
  it("uses Cloudflare's invisible test site key when no key is built in", () => {
    expect(turnstileTestSiteKey).toBe("1x00000000000000000000BB");
    expect(turnstileSiteKey).toBe(turnstileTestSiteKey);
  });

  it("renders the widget once with execution execute and runs it on each token()", async () => {
    const { api, provider, container } = fakeTurnstile();
    expect(await provider.token()).toBe(dummyToken);
    expect(api.render).toHaveBeenCalledTimes(1);
    expect(api.render.mock.calls[0]?.[0]).toBe(container);
    expect(api.render.mock.calls[0]?.[1]).toMatchObject({
      sitekey: turnstileTestSiteKey,
      action: "join",
      execution: "execute",
    });
    expect(api.execute).toHaveBeenCalledWith(container);
    expect(api.reset).not.toHaveBeenCalled();

    expect(await provider.token()).toBe(dummyToken);
    expect(api.render).toHaveBeenCalledTimes(1);
    expect(api.execute).toHaveBeenCalledTimes(2);
  });

  it("resets the spent token before every later run and on reset()", async () => {
    const { api, provider } = fakeTurnstile();
    await provider.token();
    await provider.token();
    expect(api.reset).toHaveBeenCalledTimes(1);
    expect(api.reset.mock.invocationCallOrder[0]).toBeLessThan(
      api.execute.mock.invocationCallOrder[1] ?? 0,
    );
    provider.reset();
    expect(api.reset).toHaveBeenCalledWith("widget-1");
  });

  it("fails when the widget reports an error or times out", async () => {
    const failing = fakeTurnstile((options) => options["error-callback"]("300030"));
    await expect(failing.provider.token()).rejects.toThrow("300030");
    const slow = fakeTurnstile((options) => options["timeout-callback"]());
    await expect(slow.provider.token()).rejects.toThrow("timed out");
  });

  it("fails when the script can't load, and tries again on the next tap", async () => {
    const api = fakeTurnstile().api;
    const load = vi
      .fn<() => Promise<TurnstileApi>>()
      .mockRejectedValueOnce(new Error("blocked"))
      .mockResolvedValue(api);
    const provider = createTurnstile({ action: "create", load, mount: () => ({}) as HTMLElement });
    await expect(provider.token()).rejects.toThrow("blocked");
    expect(await provider.token()).toBe(dummyToken);
    expect(api.render.mock.calls[0]?.[1].action).toBe("create");
  });

  it("gives up when no token arrives in time", async () => {
    vi.useFakeTimers();
    const { provider } = fakeTurnstile(() => {});
    const failure = provider.token().then(
      () => null,
      (error: unknown) => error,
    );
    await vi.advanceTimersByTimeAsync(turnstileRunTimeoutMs);
    expect(await failure).toEqual(new Error("Turnstile gave no token"));
  });
});
