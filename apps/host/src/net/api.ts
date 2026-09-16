import {
  apiErrorSchema,
  createRoomResponseSchema,
  rejoinResponseSchema,
  type CreateRoomResponse,
  type RejoinResponse,
} from "@couchcade/protocol";

/** The part of a protocol schema this file needs. */
interface Schema<T> {
  safeParse(data: unknown): { success: true; data: T } | { success: false };
}

/** A failed API call. `code` is the server's error code, or `network` / `unexpected`. */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number) {
    super(`API error ${code} (${status})`);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

/**
 * `POST /api/rooms`. The passcode lives only in this call: it's sent once and never stored
 * (docs/architecture/security.md, "Host passcode").
 */
export function createRoom(passcode: string): Promise<CreateRoomResponse> {
  // CC-2.2 renders the invisible Turnstile widget and sends its token here.
  return post("/api/rooms", { passcode, turnstile: "" }, createRoomResponseSchema);
}

/** `POST /api/rooms/:code/rejoin`: swaps the host's rejoin token for a fresh 60-second ticket. */
export function rejoinRoom(code: string, rejoinToken: string): Promise<RejoinResponse> {
  return post(`/api/rooms/${code}/rejoin`, { rejoinToken }, rejoinResponseSchema);
}

async function post<T>(path: string, body: Record<string, string>, schema: Schema<T>): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError("network", 0);
  }
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = apiErrorSchema.safeParse(data);
    throw new ApiError(error.success ? error.data.error : "unexpected", response.status);
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new ApiError("unexpected", response.status);
  return parsed.data;
}
