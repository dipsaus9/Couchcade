import type { Room } from "../room/room.ts";

/** What the API handlers need from the Worker. Passed in, so the API never imports the Worker. */
export interface ApiContext {
  env: Cloudflare.Env;
  /** The stub for room `code`. Every call to it costs one Durable Object request. */
  room(code: string): DurableObjectStub<Room>;
  /** A new random room code. */
  newRoomCode(): string;
}
