/**
 * `@couchcade/game-sdk/link`: the pure, DOM-free WebRTC link pieces both apps share
 * (docs/architecture/realtime-link.md, "Game SDK API sketch" > "Where the code lives").
 *
 * - `description.ts`: the compact session description codec (`encodeDescription`, `decodeDescription`)
 * - `clock.ts`: the link clock maths (`linkClockSampleOf`, `linkOffsetToRoom`)
 * - `buckets.ts`: the TV-side token buckets and cut-off tracking (`createLinkGuard`)
 * - `dedupe.ts`: event de-duplication (`createEventDedupe`)
 * - `state-machine.ts`: the connection lifecycle (`createLinkStateMachine`)
 *
 * No `RTCPeerConnection` here: the browser wiring lives in `apps/controller/src/runtime/link.ts`
 * and `apps/host/src/runtime/links.ts` (CC-3.19, CC-3.20). `@couchcade/game-sdk/testing`'s
 * `createFakeLink` stands in for the wiring in tests until then.
 */
export * from "./buckets.ts";
export * from "./clock.ts";
export * from "./dedupe.ts";
export * from "./description.ts";
export * from "./state-machine.ts";
