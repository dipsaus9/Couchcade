import type { PipProfile } from "@couchcade/protocol";

/** pips.md "On the phone", "Customiser changes": 400ms after the last change, at most once a second. */
const DEBOUNCE_MS = 400;
const MIN_INTERVAL_MS = 1000;

export interface ProfileSenderOptions {
  /** Sends one `player:profile` for the given look. */
  send(profile: PipProfile): void;
  /** The Pip already known to the room (the last one sent, or the one the phone joined with). */
  initial: PipProfile;
  now?: () => number;
  setTimer?: (run: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export interface ProfileSender {
  /**
   * Call on every customiser change. Schedules a send 400ms after the last call, delayed further
   * so sends stay at least 1000ms apart. A call that matches the last sent look cancels any
   * pending send instead (dedup): flipping back to the look already on the room costs nothing.
   */
  update(profile: PipProfile): void;
  /** Cancels a pending send without firing it (component unmount). */
  dispose(): void;
}

/**
 * The Pip send rule (pips.md "Customiser changes", Budgets "Pip requests per player"): tapping
 * through all 8 hairstyles costs one or two requests, not eight. Pure and timer-injectable so the
 * timing is exact under fake timers, not flaky under real ones.
 */
export function createProfileSender({
  send,
  initial,
  now = Date.now,
  setTimer = (run, ms) => setTimeout(run, ms),
  clearTimer = (handle) => clearTimeout(handle as Parameters<typeof clearTimeout>[0]),
}: ProfileSenderOptions): ProfileSender {
  let lastSent = initial;
  let lastSentAt = Number.NEGATIVE_INFINITY;
  let pending: PipProfile | null = null;
  let timer: unknown = null;

  function cancelTimer(): void {
    if (timer !== null) {
      clearTimer(timer);
      timer = null;
    }
  }

  function fire(): void {
    timer = null;
    if (pending === null) return;
    const profile = pending;
    pending = null;
    lastSent = profile;
    lastSentAt = now();
    send(profile);
  }

  function update(profile: PipProfile): void {
    if (sameProfile(profile, lastSent)) {
      pending = null;
      cancelTimer();
      return;
    }
    pending = profile;
    cancelTimer();
    const elapsedSinceLastSend = now() - lastSentAt;
    const wait = Math.max(DEBOUNCE_MS, MIN_INTERVAL_MS - elapsedSinceLastSend);
    timer = setTimer(fire, wait);
  }

  function dispose(): void {
    cancelTimer();
    pending = null;
  }

  return { update, dispose };
}

function sameProfile(a: PipProfile, b: PipProfile): boolean {
  return a.skin === b.skin && a.hair === b.hair && a.hairColour === b.hairColour;
}
