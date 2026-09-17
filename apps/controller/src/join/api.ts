import {
  apiErrorSchema,
  joinRoomResponseSchema,
  rejoinResponseSchema,
  type JoinRoomRequest,
  type JoinRoomResponse,
} from "@couchcade/protocol";

/** Why a join didn't work, as the join screen explains it. */
export type JoinFailure =
  | "not-found"
  | "name-not-allowed"
  | "room-full"
  | "room-locked"
  | "rate-limited"
  | "turnstile"
  | "offline"
  | "unavailable";

export type JoinResult =
  | { ok: true; joined: JoinRoomResponse }
  | { ok: false; failure: JoinFailure };

/** `refused` means the rejoin token no longer works: the player has to join again. */
export type RejoinResult =
  | { ok: true; ticket: string }
  | { ok: false; failure: "refused" | "offline" | "unavailable" };

export type FetchFn = (input: string, init: RequestInit) => Promise<Response>;

/** Error codes from apps/server/src/api/errors.ts that the join screen explains. */
const joinFailureByError: Record<string, JoinFailure> = {
  "not-found": "not-found",
  "name-not-allowed": "name-not-allowed",
  "room-full": "room-full",
  "room-locked": "room-locked",
  "rate-limited": "rate-limited",
  "turnstile-failed": "turnstile",
  "turnstile-unavailable": "turnstile",
};

/** Used when the body has no known error code, for example from a proxy. */
const joinFailureByStatus: Record<number, JoinFailure> = {
  403: "turnstile",
  404: "not-found",
  409: "room-full",
  423: "room-locked",
  429: "rate-limited",
};

/** Maps an error response of `POST /api/rooms/:code/join` to what the player is told. */
export function joinFailureFor(status: number, body: unknown): JoinFailure {
  const parsed = apiErrorSchema.safeParse(body);
  const byError = parsed.success ? joinFailureByError[parsed.data.error] : undefined;
  if (byError) return byError;
  // A known code that isn't the player's fault (bad-request, forbidden-origin, not-configured).
  if (parsed.success) return "unavailable";
  return joinFailureByStatus[status] ?? "unavailable";
}

/** `POST /api/rooms/:code/join`. Never throws: every outcome is a result. */
export async function requestJoin(
  code: string,
  body: JoinRoomRequest,
  fetchFn: FetchFn = fetch,
): Promise<JoinResult> {
  const answer = await postJson(fetchFn, `/api/rooms/${code}/join`, body);
  if (answer === "offline") return { ok: false, failure: "offline" };
  if (!answer.ok) return { ok: false, failure: joinFailureFor(answer.status, answer.body) };
  const joined = joinRoomResponseSchema.safeParse(answer.body);
  return joined.success ? { ok: true, joined: joined.data } : { ok: false, failure: "unavailable" };
}

/** `POST /api/rooms/:code/rejoin`: swaps the rejoin token for a fresh 60-second ticket. */
export async function requestRejoin(
  code: string,
  rejoinToken: string,
  fetchFn: FetchFn = fetch,
): Promise<RejoinResult> {
  const answer = await postJson(fetchFn, `/api/rooms/${code}/rejoin`, { rejoinToken });
  if (answer === "offline") return { ok: false, failure: "offline" };
  if (answer.status === 401) return { ok: false, failure: "refused" };
  const parsed = answer.ok ? rejoinResponseSchema.safeParse(answer.body) : null;
  return parsed?.success
    ? { ok: true, ticket: parsed.data.ticket }
    : { ok: false, failure: "unavailable" };
}

interface JsonAnswer {
  ok: boolean;
  status: number;
  body: unknown;
}

async function postJson(
  fetchFn: FetchFn,
  url: string,
  body: unknown,
): Promise<JsonAnswer | "offline"> {
  let response: Response;
  try {
    response = await fetchFn(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    // fetch only rejects when the request never got an answer.
    return "offline";
  }
  let json: unknown = null;
  try {
    json = await response.json();
  } catch {
    // Not JSON, for example an HTML error page. The status still says what happened.
  }
  return { ok: response.ok, status: response.status, body: json };
}
