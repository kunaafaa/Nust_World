import { describe, expect, it } from 'vitest';
import {
  ARRIVE_M,
  REROUTE_EVERY_MS,
  REROUTE_M,
  cumulative,
  currentStep,
  damp,
  isNavigating,
  navReduce,
  projectOnPath,
  shouldReroute,
  type NavState,
} from '@/lib/navMachine';

const run = (s: NavState, ...evs: Parameters<typeof navReduce>[1][]) =>
  evs.reduce((st, e) => navReduce(st, e).state, s);

describe('navigation state machine', () => {
  it('IDLE -> ROUTE_PREVIEW on a destination, fitting the route', () => {
    expect(navReduce('IDLE', { type: 'DESTINATION' })).toEqual({
      state: 'ROUTE_PREVIEW',
      effects: ['fitRoute'],
    });
  });
  it('ROUTE_PREVIEW -> NAV_FOLLOW on Start', () => {
    expect(navReduce('ROUTE_PREVIEW', { type: 'START' })).toEqual({
      state: 'NAV_FOLLOW',
      effects: ['enterFollow'],
    });
    // Start means nothing outside the preview
    expect(navReduce('IDLE', { type: 'START' }).state).toBe('IDLE');
  });
  it('pan and rotate leave NAV_FOLLOW for NAV_FREE; pinch keeps following', () => {
    expect(navReduce('NAV_FOLLOW', { type: 'GESTURE', kind: 'pan' }).state).toBe('NAV_FREE');
    expect(navReduce('NAV_FOLLOW', { type: 'GESTURE', kind: 'rotate' }).state).toBe('NAV_FREE');
    expect(navReduce('NAV_FOLLOW', { type: 'GESTURE', kind: 'pinch' })).toEqual({
      state: 'NAV_FOLLOW',
      effects: [],
    });
  });
  it('NAV_FREE returns to NAV_FOLLOW on re-centre or idle timeout, with a flight to the user', () => {
    for (const type of ['RECENTRE', 'IDLE_TIMEOUT'] as const)
      expect(navReduce('NAV_FREE', { type })).toEqual({
        state: 'NAV_FOLLOW',
        effects: ['flyToUser'],
      });
    // more gestures in NAV_FREE change nothing
    expect(navReduce('NAV_FREE', { type: 'GESTURE', kind: 'pan' }).state).toBe('NAV_FREE');
  });
  it('arrives within ARRIVE_M (15 m) from NAV_FOLLOW and NAV_FREE, not before', () => {
    expect(ARRIVE_M).toBe(15);
    for (const s of ['NAV_FOLLOW', 'NAV_FREE'] as const) {
      expect(navReduce(s, { type: 'FIX', toDestM: 15.1 }).state).toBe(s);
      expect(navReduce(s, { type: 'FIX', toDestM: 15 })).toEqual({
        state: 'ARRIVED',
        effects: ['arrived'],
      });
    }
    // the preview never "arrives"
    expect(navReduce('ROUTE_PREVIEW', { type: 'FIX', toDestM: 1 }).state).toBe('ROUTE_PREVIEW');
  });
  it('ARRIVED -> IDLE with the destination card at peek and the camera restored', () => {
    expect(navReduce('ARRIVED', { type: 'ARRIVED_DONE' })).toEqual({
      state: 'IDLE',
      effects: ['restoreCamera', 'showDestinationCard'],
    });
  });
  it('END always works and restores the camera', () => {
    for (const s of ['ROUTE_PREVIEW', 'NAV_FOLLOW', 'NAV_FREE', 'ARRIVED'] as const)
      expect(navReduce(s, { type: 'END' })).toEqual({ state: 'IDLE', effects: ['restoreCamera'] });
    expect(navReduce('IDLE', { type: 'END' }).effects).toEqual([]);
  });
  it('a full walk: preview, start, look around, come back, arrive', () => {
    expect(
      run(
        'IDLE',
        { type: 'DESTINATION' },
        { type: 'START' },
        { type: 'GESTURE', kind: 'pinch' },
        { type: 'GESTURE', kind: 'pan' },
        { type: 'IDLE_TIMEOUT' },
        { type: 'FIX', toDestM: 40 },
        { type: 'FIX', toDestM: 9 },
        { type: 'ARRIVED_DONE' },
      ),
    ).toBe('IDLE');
  });
  it('isNavigating covers NAV_FOLLOW and NAV_FREE only', () => {
    expect(
      ['IDLE', 'ROUTE_PREVIEW', 'NAV_FOLLOW', 'NAV_FREE', 'ARRIVED'].map((s) =>
        isNavigating(s as NavState),
      ),
    ).toEqual([false, false, true, true, false]);
  });
});

describe('reroute threshold and debounce', () => {
  it('only when more than 25 m off the path', () => {
    expect(REROUTE_M).toBe(25);
    expect(shouldReroute(25, 0, 10_000)).toBe(false);
    expect(shouldReroute(25.5, 0, 10_000)).toBe(true);
  });
  it('at most once every 3 s', () => {
    expect(REROUTE_EVERY_MS).toBe(3000);
    expect(shouldReroute(80, 10_000, 12_999)).toBe(false);
    expect(shouldReroute(80, 10_000, 13_000)).toBe(true);
  });
});

describe('path progress helpers', () => {
  const path: [number, number][] = [
    [0, 0],
    [100, 0],
    [100, 50],
  ];
  const cum = cumulative(path);
  it('cumulative distances', () => {
    expect(cum).toEqual([0, 100, 150]);
  });
  it('projects a point onto the path: along and off', () => {
    const p = projectOnPath(path, cum, [40, 30]);
    expect(p.along).toBeCloseTo(40);
    expect(p.off).toBeCloseTo(30);
    expect(p.seg).toBe(0);
    const q = projectOnPath(path, cum, [110, 20]);
    expect(q.along).toBeCloseTo(120);
    expect(q.off).toBeCloseTo(10);
  });
  it('current step = the next step ahead of the user', () => {
    const stepAt = [0, 100, 150]; // start, turn, arrive
    expect(currentStep(stepAt, 0)).toBe(1);
    expect(currentStep(stepAt, 60)).toBe(1);
    expect(currentStep(stepAt, 100)).toBe(2);
    expect(currentStep(stepAt, 149)).toBe(2);
  });
  it('damping is frame-rate independent', () => {
    // two 1/60 s frames close the same gap as one 1/30 s frame
    const a = 1 - (1 - damp(6, 1 / 60)) ** 2;
    expect(a).toBeCloseTo(damp(6, 1 / 30), 10);
  });
});
