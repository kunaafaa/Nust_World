import { describe, expect, it } from 'vitest';
import { parseUrlParams } from '@/lib/urlParams';
import { contentSecurityPolicy, httpsOrigin } from '@/lib/security/headers';

describe('parseUrlParams', () => {
  it('accepts valid place ids and rejects anything else', () => {
    expect(parseUrlParams('?place=concordia-1-6900').place).toBe('concordia-1-6900');
    expect(parseUrlParams('?place=prov-razi-hostel').place).toBe('prov-razi-hostel');
    for (const bad of [
      '<img src=x onerror=alert(1)>',
      'javascript:alert(1)',
      'A-B',
      '-x',
      'a'.repeat(81),
      '',
    ])
      expect(parseUrlParams(`?place=${encodeURIComponent(bad)}`).place).toBeNull();
    expect(parseUrlParams('?from=gate-2&to=<b>').from).toBe('gate-2');
    expect(parseUrlParams('?from=gate-2&to=<b>').to).toBeNull();
  });

  it('clamps numbers and falls back on junk', () => {
    expect(parseUrlParams('?simulate=gate1&walkSpeed=6').walkSpeed).toBe(6);
    expect(parseUrlParams('?walkSpeed=1e9').walkSpeed).toBe(50);
    expect(parseUrlParams('?walkSpeed=-3').walkSpeed).toBe(0.1);
    expect(parseUrlParams('?walkSpeed=abc').walkSpeed).toBe(1.4);
    expect(parseUrlParams('?simHz=99').simHz).toBe(10);
    expect(parseUrlParams('?simHz=NaN').simHz).toBe(1);
  });

  it('only accepts known simulate values', () => {
    expect(parseUrlParams('?simulate=gate1').simulate).toBe('gate1');
    expect(parseUrlParams('?simulate=GATE12').simulate).toBe('gate12');
    expect(parseUrlParams('?simulate').simulate).toBe('');
    expect(parseUrlParams('?simulate=<script>').simulate).toBeNull();
    expect(parseUrlParams('').simulate).toBeNull();
  });

  it('turns every developer tool off when DEV_TOOLS is off', () => {
    const q = '?debug=1&perf=1&shots=1&simulate=gate1&walk=1&reviews=memory&topo=off&edge=off';
    const on = parseUrlParams(q, true);
    expect([
      on.debug,
      on.perf,
      on.shots,
      on.walk,
      on.reviewsMemory,
      on.topoOff,
      on.edgeOff,
    ]).toEqual(Array(7).fill(true));
    expect(on.simulate).toBe('gate1');
    const offP = parseUrlParams(q, false);
    expect([
      offP.debug,
      offP.perf,
      offP.shots,
      offP.walk,
      offP.reviewsMemory,
      offP.topoOff,
      offP.edgeOff,
    ]).toEqual(Array(7).fill(false));
    expect(offP.simulate).toBeNull();
    // user-facing options stay
    expect(parseUrlParams('?flat=1&low=1&terrain=1', false)).toMatchObject({
      flat: true,
      low: true,
      terrain: true,
    });
  });
});

describe('security headers', () => {
  it('builds a strict production policy', () => {
    const p = contentSecurityPolicy({
      nonce: 'abc',
      dev: false,
      supabaseUrl: 'https://xyz.supabase.co/',
    });
    expect(p).toContain("script-src 'self' 'nonce-abc' 'strict-dynamic'");
    expect(p).not.toContain('unsafe-eval');
    expect(p).toContain("connect-src 'self' https://xyz.supabase.co");
    expect(p).toContain("frame-ancestors 'none'");
    expect(p).toContain("object-src 'none'");
    expect(p).toContain('upgrade-insecure-requests');
  });
  it('allows eval only in development', () => {
    expect(contentSecurityPolicy({ nonce: 'n', dev: true })).toContain("'unsafe-eval'");
  });
  it('ignores a Supabase URL that is not https', () => {
    expect(httpsOrigin('http://evil.example')).toBeNull();
    expect(httpsOrigin('not a url')).toBeNull();
    expect(httpsOrigin('https://x.supabase.co; script-src *')).toBeNull();
    expect(httpsOrigin('https://x.supabase.co/rest/v1')).toBe('https://x.supabase.co');
  });
});
