/** Advisory web audio session preference, when the host actually implements it.
 * This is not access to Android AudioManager and cannot override a native host's focus policy.
 */
export function requestMixableAudio(): void {
  if (typeof navigator === "undefined") return;
  try {
    const session = (
      navigator as Navigator & { audioSession?: { type: string } }
    ).audioSession;
    if (session) session.type = "ambient";
  } catch {
    /* Experimental/host-limited API. Playback remains available. */
  }
}
