/** Short vibration on select/arrival where the browser supports it (silent no-op elsewhere). */
export function haptic(ms: number | number[] = 12) {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(ms);
  } catch {
    /* ignore */
  }
}
