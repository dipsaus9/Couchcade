// Per-IP speed bumps from docs/architecture/security.md, "Rate limits". The bindings and their
// limits are declared in wrangler.jsonc. On the Free plan they let several times the limit through
// (CC-1.4), so they slow abuse down and nothing may depend on an exact count.

/** The Rate Limiting bindings, each named after what it counts. */
export const rateLimitPurpose = {
  /** Every `POST /api/rooms`, 5 per minute. */
  RL_PASSCODE: "passcode",
  /** Room creations that passed the passcode, 3 per minute. */
  RL_CREATE: "create",
  /** Every join attempt, 20 per minute. */
  RL_JOIN: "join",
  /** Every rejoin, 30 per minute. */
  RL_REJOIN: "rejoin",
  /** Every `/ws` upgrade that reaches step 4, 30 per minute. */
  RL_UPGRADE: "upgrade",
} as const;

export type RateLimitName = keyof typeof rateLimitPurpose;

/**
 * The client part of a rate-limit key: the `CF-Connecting-IP` header, cut to its first 64 bits for
 * IPv6, because one home or phone gets a whole /64 block. Cloudflare always sets the header, and
 * the local dev server does too. A request without it shares one bucket with every other such
 * request, so leaving the header out never escapes a limit.
 */
export function clientKey(headers: Headers): string {
  const ip = headers.get("CF-Connecting-IP")?.trim().toLowerCase();
  if (!ip) return "unknown";
  const mappedIpv4 = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(ip)?.[1];
  if (mappedIpv4) return mappedIpv4;
  return ip.includes(":") ? (ipv6Prefix(ip) ?? ip) : ip;
}

/** The first 4 groups of an IPv6 address, without leading zeros. Null when it doesn't parse. */
function ipv6Prefix(ip: string): string | null {
  const [head = "", tail, extra] = ip.split("::");
  if (extra !== undefined) return null;
  const headGroups = groups(head);
  const tailGroups = tail === undefined ? [] : groups(tail);
  if (!headGroups || !tailGroups) return null;
  const missing = 8 - headGroups.length - tailGroups.length;
  if (tail === undefined ? missing !== 0 : missing < 1) return null;
  const all = [
    ...headGroups,
    ...Array<string>(tail === undefined ? 0 : missing).fill("0"),
    ...tailGroups,
  ];
  return all.slice(0, 4).join(":");
}

/** Hex groups of one side of an IPv6 address. An embedded IPv4 address counts as two groups. */
function groups(part: string): string[] | null {
  if (part === "") return [];
  const result: string[] = [];
  for (const group of part.split(":")) {
    if (/^[0-9a-f]{1,4}$/.test(group)) result.push(group.replace(/^0+(?=.)/, ""));
    else if (/^\d{1,3}(\.\d{1,3}){3}$/.test(group)) result.push("v4", "v4");
    else return null;
  }
  return result;
}

/**
 * Counts this request against `name` and answers true when it is over the limit. The key starts
 * with the binding's purpose, so a test or a log reads clearly. The key lives only in the binding's
 * memory and is never stored.
 */
export async function isRateLimited(
  env: Pick<Cloudflare.Env, RateLimitName>,
  name: RateLimitName,
  request: Request,
): Promise<boolean> {
  const { success } = await env[name].limit({
    key: `${rateLimitPurpose[name]}:${clientKey(request.headers)}`,
  });
  return !success;
}
