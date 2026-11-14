import { describe, expect, it } from 'vitest';
import { chooseSnap, snapOffsets } from '../src/components/BottomSheet';

describe('snapOffsets', () => {
  it('portrait phone: full = 90% of the height, half = 45%, peek = header height', () => {
    const s = snapOffsets(844, false, 96, 0);
    expect(s.full).toBe(760);
    expect(s.heights).toEqual({ full: 760, half: 380, peek: 96 });
    expect(s.offsets).toEqual({ full: 0, half: 380, peek: 664 });
  });
  it('small phone 360x640', () => {
    const s = snapOffsets(640, false, 96, 0);
    expect(s.heights).toEqual({ full: 576, half: 288, peek: 96 });
    expect(s.offsets.peek).toBe(480);
  });
  it('landscape / wide screens use the side panel: full = height - 136, half = 55%', () => {
    const s = snapOffsets(390, true, 96, 0);
    expect(s.full).toBe(254);
    expect(s.heights.half).toBe(215);
    expect(s.offsets).toEqual({ full: 0, half: 39, peek: 158 });
  });
  it('never shorter than 200 px in side mode, and half never exceeds full', () => {
    expect(snapOffsets(300, true, 96, 0).full).toBe(200);
    const s = snapOffsets(300, true, 96, 0);
    expect(s.heights.half).toBeLessThanOrEqual(s.full);
  });
  it('the safe-area inset makes the peek taller, not the others', () => {
    const s = snapOffsets(844, false, 96, 34);
    expect(s.heights.peek).toBe(130);
    expect(s.heights.half).toBe(380);
    expect(s.offsets.peek).toBe(760 - 130);
  });
});

describe('chooseSnap', () => {
  const o = snapOffsets(844, false, 96, 0).offsets; // full 0, half 380, peek 664
  it('settles on the nearest snap when released slowly', () => {
    expect(chooseSnap(10, 0, 'half', o)).toBe('full');
    expect(chooseSnap(380, 0, 'full', o)).toBe('half');
    expect(chooseSnap(600, 0, 'half', o)).toBe('peek');
  });
  it('a fast flick carries past the nearest snap', () => {
    expect(chooseSnap(300, -1500, 'half', o)).toBe('full');
    expect(chooseSnap(450, 1500, 'half', o)).toBe('peek');
  });
  it('from peek, a long or fast pull down closes the card', () => {
    expect(chooseSnap(o.peek + 60, 0, 'peek', o)).toBe('close');
    expect(chooseSnap(o.peek + 5, 800, 'peek', o)).toBe('close');
    expect(chooseSnap(o.peek + 10, 0, 'peek', o)).toBe('peek');
  });
  it('from half, even a hard pull down only returns to peek (never closes)', () => {
    expect(chooseSnap(o.peek, 2000, 'half', o)).toBe('peek');
  });
});
