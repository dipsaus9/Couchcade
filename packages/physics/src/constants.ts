/** The fixed step every `stepWorld` call takes, in milliseconds. Matches the host's 60 Hz tick. */
export const STEP_MS = 1000 / 60;

/** The fixed step in seconds, as Planck takes it. */
export const STEP_SECONDS = 1 / 60;

/** Velocity constraint iterations per step. */
export const VELOCITY_ITERATIONS = 8;

/** Position constraint iterations per step. */
export const POSITION_ITERATIONS = 3;

/** World pixels per metre. The 480x270 world is 30 x 16.875 metres. */
export const PIXELS_PER_METRE = 16;
