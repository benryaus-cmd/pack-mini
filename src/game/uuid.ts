/** Compact UUID-compatible IDs for browsers without randomUUID(). */
export function generateId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    try {
      return crypto.randomUUID().replaceAll("-", "");
    } catch {
      /* Use getRandomValues. */
    }
  }
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.getRandomValues === "function"
  ) {
    try {
      const bytes = crypto.getRandomValues(new Uint8Array(16));
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      return Array.from(bytes, (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("");
    } catch {
      /* Use the non-cryptographic last resort. */
    }
  }
  let id = "";
  for (let index = 0; index < 32; index += 1)
    id += Math.floor(Math.random() * 16).toString(16);
  return id;
}
