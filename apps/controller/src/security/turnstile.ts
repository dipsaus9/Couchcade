import type { TurnstileProvider } from "../join/turnstile.ts";

// The invisible Turnstile widget behind the Join button (docs/architecture/security.md, "Where
// Turnstile runs"). Turnstile is the only third-party script on the page, and it loads only when
// a player taps Join. apps/host/src/security/turnstile.ts is the TV's copy: apps can't import
// each other, so keep the two in step.

/**
 * Cloudflare's test site key for an Invisible widget that always passes. Its token is the dummy
 * token XXXX.DUMMY.TOKEN.XXXX, which the test secret in apps/server/.dev.vars accepts.
 */
export const turnstileTestSiteKey = "1x00000000000000000000BB";

/**
 * The widget's public site key, built in from `VITE_TURNSTILE_SITE_KEY` (set by
 * .github/workflows/deploy.yml). Development, tests and CI builds use the test key.
 */
export const turnstileSiteKey: string =
  import.meta.env.VITE_TURNSTILE_SITE_KEY || turnstileTestSiteKey;

export const turnstileScriptUrl =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

/** A run that hasn't produced a token by now fails, so the Join button never spins forever. */
export const turnstileRunTimeoutMs = 30_000;

/** The render options this file passes (Cloudflare's client-side rendering docs). */
export interface TurnstileRenderOptions {
  sitekey: string;
  action: string;
  execution: "execute";
  retry: "never";
  "refresh-expired": "manual";
  callback(token: string): void;
  "error-callback"(code: string): boolean;
  "timeout-callback"(): void;
}

/** The part of Cloudflare's `window.turnstile` this file uses. */
export interface TurnstileApi {
  render(container: HTMLElement, options: TurnstileRenderOptions): string | null | undefined;
  execute(container: HTMLElement): void;
  reset(widgetId: string): void;
}

export interface TurnstileOptions {
  /** The endpoint the token is for. The Worker refuses a token made for another action. */
  action: "create" | "join";
  siteKey?: string;
  /** Loads Cloudflare's script once. Tests pass a fake. */
  load?: () => Promise<TurnstileApi>;
  /** The element the widget renders into. An Invisible widget shows nothing in it. */
  mount?: () => HTMLElement;
}

/**
 * A provider that renders the widget once with `execution: "execute"` and runs it on every
 * `token()`, so each request gets a fresh single-use token. The widget is reset before every run
 * after the first, and after a 403, because a sent token is spent.
 */
export function createTurnstile({
  action,
  siteKey = turnstileSiteKey,
  load = loadTurnstileScript,
  mount = mountContainer,
}: TurnstileOptions): TurnstileProvider {
  let container: HTMLElement | null = null;
  let widgetId: string | null = null;
  let pending: { resolve(token: string): void; reject(error: Error): void } | null = null;

  const settle = (outcome: { token: string } | { error: Error }): void => {
    const run = pending;
    pending = null;
    if (!run) return;
    if ("token" in outcome) run.resolve(outcome.token);
    else run.reject(outcome.error);
  };

  const options: TurnstileRenderOptions = {
    sitekey: siteKey,
    action,
    execution: "execute",
    retry: "never",
    "refresh-expired": "manual",
    callback: (token) => {
      settle({ token });
    },
    "error-callback": (code) => {
      settle({ error: new Error(`Turnstile error ${code}`) });
      return true;
    },
    "timeout-callback": () => {
      settle({ error: new Error("Turnstile timed out") });
    },
  };

  let api: TurnstileApi | null = null;
  /** Clears the widget's last token, which is spent once it has been sent. */
  const clear = (): void => {
    if (api && widgetId !== null) api.reset(widgetId);
  };

  return {
    async token() {
      const turnstile = await load();
      api = turnstile;
      // A run still waiting (a second tap) gives way to this one.
      settle({ error: new Error("Turnstile run replaced") });
      container ??= mount();
      if (widgetId === null) {
        widgetId = turnstile.render(container, options) ?? null;
        if (widgetId === null) throw new Error("Turnstile didn't render");
      } else {
        clear();
      }
      const target = container;

      return new Promise<string>((resolve, reject) => {
        const timer = setTimeout(
          () => settle({ error: new Error("Turnstile gave no token") }),
          turnstileRunTimeoutMs,
        );
        pending = {
          resolve: (token) => {
            clearTimeout(timer);
            resolve(token);
          },
          reject: (error) => {
            clearTimeout(timer);
            reject(error);
          },
        };
        try {
          turnstile.execute(target);
        } catch {
          settle({ error: new Error("Turnstile didn't run") });
        }
      });
    },
    reset: clear,
  };
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let script: Promise<TurnstileApi> | null = null;

/** Adds Cloudflare's script to the page once. A failed load is tried again on the next tap. */
export function loadTurnstileScript(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  script ??= new Promise<TurnstileApi>((resolve, reject) => {
    const element = document.createElement("script");
    element.src = turnstileScriptUrl;
    element.async = true;
    element.addEventListener("load", () => {
      if (window.turnstile) resolve(window.turnstile);
      else reject(new Error("Turnstile script loaded without window.turnstile"));
    });
    element.addEventListener("error", () => {
      element.remove();
      script = null;
      reject(new Error("Turnstile script failed to load"));
    });
    document.head.append(element);
  });
  return script;
}

function mountContainer(): HTMLElement {
  const element = document.createElement("div");
  element.className = "turnstile";
  document.body.append(element);
  return element;
}
