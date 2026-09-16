/** Request bodies over this many bytes are refused, like protocol frames. */
export const maxBodyBytes = 1024;

/**
 * Reads a JSON object body of at most `maxBodyBytes`. Returns null for anything else: a larger
 * body, invalid UTF-8, invalid JSON, or JSON that isn't an object. It stops reading as soon as the
 * body is too large, so a huge body costs no more than a small one.
 */
export async function readJsonObject(request: Request): Promise<Record<string, unknown> | null> {
  const declared = Number(request.headers.get("Content-Length") ?? 0);
  if (!request.body || !(declared <= maxBodyBytes)) return null;

  const reader = request.body.getReader();
  const bytes = new Uint8Array(maxBodyBytes);
  let length = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (length + value.byteLength > maxBodyBytes) {
      await reader.cancel();
      return null;
    }
    bytes.set(value, length);
    length += value.byteLength;
  }

  try {
    const value: unknown = JSON.parse(strictDecoder.decode(bytes.subarray(0, length)));
    if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
  } catch {
    return null;
  }
}

const strictDecoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false });
