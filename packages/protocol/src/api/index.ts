import * as z from "zod/mini";
import {
  pipProfileSchema,
  playerIdSchema,
  playerNameSchema,
  roomCodeSchema,
} from "../shared/index.ts";

// HTTP API bodies from docs/architecture/platform.md, "HTTP API". Passcode, Turnstile and name
// rules are checked by the server (CC-2.2, CC-2.4); these schemas only fix the shapes.

const token = z.string().check(z.minLength(1));

/** `POST /api/rooms` body. */
export const createRoomRequestSchema = z.object({
  passcode: z.string(),
  turnstile: z.string(),
});
export type CreateRoomRequest = z.infer<typeof createRoomRequestSchema>;

/** `POST /api/rooms` 201 response. */
export const createRoomResponseSchema = z.object({
  code: roomCodeSchema,
  ticket: token,
  rejoinToken: token,
});
export type CreateRoomResponse = z.infer<typeof createRoomResponseSchema>;

/** `POST /api/rooms/:code/join` body. `name` is raw input; the server normalises it. */
export const joinRoomRequestSchema = z.object({
  name: z.string(),
  turnstile: z.string(),
  profile: z.optional(pipProfileSchema),
});
export type JoinRoomRequest = z.infer<typeof joinRoomRequestSchema>;

/** `POST /api/rooms/:code/join` 200 response. `name` is the normalised name. */
export const joinRoomResponseSchema = z.object({
  playerId: playerIdSchema,
  name: playerNameSchema,
  ticket: token,
  rejoinToken: token,
});
export type JoinRoomResponse = z.infer<typeof joinRoomResponseSchema>;

/** `POST /api/rooms/:code/rejoin` body. */
export const rejoinRequestSchema = z.object({ rejoinToken: token });
export type RejoinRequest = z.infer<typeof rejoinRequestSchema>;

/** `POST /api/rooms/:code/rejoin` 200 response. */
export const rejoinResponseSchema = z.object({ ticket: token });
export type RejoinResponse = z.infer<typeof rejoinResponseSchema>;

/** Every error body. `error` is a code the apps map to referee-voice copy. */
export const apiErrorSchema = z.object({ error: z.string().check(z.minLength(1)) });
export type ApiError = z.infer<typeof apiErrorSchema>;
