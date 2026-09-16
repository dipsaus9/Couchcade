import { isRoomCode } from "@couchcade/utils";

/**
 * The URL a phone opens to join room `code`: the site root with `?room=CODE`, so the code is filled
 * in (docs/architecture/platform.md, "Joining"). `origin` is the site's origin, usually
 * `location.origin`; any path on it is ignored, because the phone app lives at `/`.
 */
export function joinUrl(origin: string, code: string): string {
  if (!isRoomCode(code)) throw new RangeError(`Not a room code: ${code}`);
  const url = new URL("/", origin);
  url.searchParams.set("room", code);
  return url.href;
}

/** The address players type when they can't scan: the host name, without scheme or path. */
export function joinAddress(origin: string): string {
  return new URL(origin).host;
}
