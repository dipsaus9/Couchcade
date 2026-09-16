/**
 * The bot check the join request carries (docs/architecture/security.md, "Where Turnstile runs").
 * CC-2.2 renders the invisible widget and passes a real provider to `createPhoneSession`.
 */
export interface TurnstileProvider {
  /** A fresh single-use token, requested when the player taps Join. */
  token(): Promise<string>;
  /** Called after a 403, because the old token is spent. */
  reset(): void;
}

/** Until CC-2.2 lands the API doesn't check Turnstile, so the phone sends an empty token. */
export const noTurnstile: TurnstileProvider = {
  token: async () => "",
  reset: () => {},
};
