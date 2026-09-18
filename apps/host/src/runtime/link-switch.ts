/**
 * The real-time link switch, from docs/architecture/realtime-link.md, "Rollout" (owner decision
 * 15, owner answer 6): off unless `VITE_REALTIME_LINK` is on, with `?link=1` or `?link=0`
 * overriding it for one page load. Mirrors `apps/controller/src/runtime/link-switch.ts` (CC-3.19):
 * "Both apps wire the link behind a switch" (Rollout step 5). `runtime/links.ts` calls
 * `realtimeLinkEnabled()` once when the host runtime is built, so "one page load" falls out of
 * reading the URL at that point: a TV reload re-reads it, no later navigation does. With the
 * switch off the host never answers an `rtc:offer`, whatever a phone's own switch says.
 */

export interface LinkSwitchOptions {
  /** The build-time default. Defaults to `import.meta.env.VITE_REALTIME_LINK`. */
  env?: boolean;
  /** The page's query string. Defaults to `location.search`. */
  search?: string;
}

function envDefault(): boolean {
  const raw = import.meta.env.VITE_REALTIME_LINK;
  return raw === "true" || raw === "1";
}

/** True when the host should answer link offers at all, for this page load. */
export function realtimeLinkEnabled(options: LinkSwitchOptions = {}): boolean {
  const search = options.search ?? globalThis.location?.search ?? "";
  const override = new URLSearchParams(search).get("link");
  if (override === "1") return true;
  if (override === "0") return false;
  return options.env ?? envDefault();
}
