/**
 * The bot check the join request carries (docs/architecture/security.md, "Where Turnstile runs").
 * App.vue passes the invisible widget from src/security/turnstile.ts to `createPhoneSession`.
 */
export interface TurnstileProvider {
  /** A fresh single-use token, requested when the player taps Join. */
  token(): Promise<string>;
  /** Called after a 403, because the old token is spent. */
  reset(): void;
}

/** Sends an empty token, which the API refuses with 403. For code that never calls the API. */
export const noTurnstile: TurnstileProvider = {
  token: async () => "",
  reset: () => {},
};
