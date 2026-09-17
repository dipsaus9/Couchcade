// Build-time settings this app reads from `import.meta.env`.
interface ImportMetaEnv {
  /** The Turnstile widget's public site key. Unset means Cloudflare's test key. */
  readonly VITE_TURNSTILE_SITE_KEY?: string;
}
