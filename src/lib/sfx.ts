/** Tiny WebAudio sound effects + haptics. No audio files. Browsers only allow sound after a tap, which always precedes these. */
let ctx: AudioContext | null = null;

function ac(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    ctx ??= new (
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    )();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

const enabled = () => {
  try {
    return localStorage.getItem('nw-sound') !== '0';
  } catch {
    return true;
  }
};
export const soundEnabled = enabled;
export function setSoundEnabled(on: boolean) {
  try {
    localStorage.setItem('nw-sound', on ? '1' : '0');
  } catch {
    /* ignore */
  }
}

function tone(
  freq: number,
  dur: number,
  type: OscillatorType = 'sine',
  gain = 0.06,
  at = 0,
  slideTo?: number,
) {
  const c = ac();
  if (!c || !enabled()) return;
  const t0 = c.currentTime + at;
  const o = c.createOscillator(),
    g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(c.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

const buzz = (p: number | number[]) => {
  try {
    navigator.vibrate?.(p);
  } catch {
    /* unsupported */
  }
};

export const sfx = {
  tap: () => {
    tone(520, 0.07, 'triangle', 0.05);
    buzz(8);
  },
  select: () => {
    tone(440, 0.09, 'triangle', 0.06);
    tone(660, 0.12, 'triangle', 0.05, 0.07);
    buzz(12);
  },
  route: () => {
    tone(392, 0.1, 'sine', 0.06);
    tone(523, 0.1, 'sine', 0.06, 0.09);
    tone(659, 0.16, 'sine', 0.06, 0.18);
    buzz([10, 30, 10]);
  },
  arrive: () => {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, 'triangle', 0.07, i * 0.1));
    buzz([60, 40, 60]);
  },
  found: () => {
    tone(880, 0.1, 'square', 0.04);
    tone(1320, 0.18, 'square', 0.04, 0.09);
    buzz(15);
  },
};
