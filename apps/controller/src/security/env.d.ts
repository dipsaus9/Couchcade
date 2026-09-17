// Build-time settings this app reads from `import.meta.env`.
interface ImportMetaEnv {
  /** The Turnstile widget's public site key. Unset means Cloudflare's test key. */
  readonly VITE_TURNSTILE_SITE_KEY?: string;
  /**
   * The real-time link switch (docs/architecture/realtime-link.md, "Rollout"). Unset or anything
   * but `"true"`/`"1"` means off; `?link=1`/`?link=0` overrides it for one page load
   * (`runtime/link-switch.ts`).
   */
  readonly VITE_REALTIME_LINK?: string;
}
