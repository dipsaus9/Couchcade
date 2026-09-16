/**
 * True when `submitted` is the host passcode. Both sides are hashed with SHA-256 first, so the
 * constant-time compare always sees two values of the same length (docs/architecture/security.md,
 * "Host passcode"). An unset or empty HOST_PASSCODE never matches, so a missing secret can't open
 * room creation to everyone.
 */
export async function passcodeMatches(
  submitted: string,
  expected: string | undefined,
): Promise<boolean> {
  if (!expected) return false;
  const [a, b] = await Promise.all([sha256(submitted), sha256(expected)]);
  return crypto.subtle.timingSafeEqual(a, b);
}

function sha256(value: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
}
