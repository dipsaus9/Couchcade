/**
 * True when `submitted` is the secret `expected`: the host passcode, or the smoke token. Both sides
 * are hashed with SHA-256 first, so the constant-time compare always sees two values of the same
 * length (docs/architecture/security.md, "Host passcode"). An unset or empty secret never matches,
 * so a missing secret can't open the door to everyone.
 */
export async function secretMatches(
  submitted: string,
  expected: string | undefined,
): Promise<boolean> {
  if (!expected) return false;
  const [a, b] = await Promise.all([sha256(submitted), sha256(expected)]);
  return crypto.subtle.timingSafeEqual(a, b);
}

/** True when `submitted` is HOST_PASSCODE. */
export const passcodeMatches = secretMatches;

function sha256(value: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
}
