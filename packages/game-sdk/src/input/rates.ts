/**
 * The free-tier send caps from docs/architecture/platform.md, "The caps", homed here as
 * docs/architecture/session-flow.md, "Real-time input batching", asks. CC-1.4 measured 1 request
 * per incoming message, so phones and the host share the day's 80,000 real-time requests.
 */

/** Phones send at most this many input messages per second. */
export const PHONE_INPUT_MAX_PER_SECOND = 4;
/** Phones leave at least this long between two input messages. */
export const PHONE_INPUT_MIN_GAP_MS = 250;
/** The host sends at most this many `controller:state` messages per second. */
export const HOST_STATE_MAX_PER_SECOND = 1.5;
/** The host leaves at least this long between two `controller:state` messages. */
export const HOST_STATE_MIN_GAP_MS = 667;
