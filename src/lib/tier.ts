'use client';
import { useApp, type Tier } from '@/store/useApp';

/** Starting tier before the fps probe: phones and small-memory devices begin at Medium. */
export function defaultTier(): Tier {
  if (typeof window === 'undefined') return 'high';
  const nav = navigator as Navigator & { deviceMemory?: number };
  const phone =
    window.matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 600;
  if ((nav.deviceMemory ?? 8) <= 2) return 'low';
  return phone || (nav.deviceMemory ?? 8) <= 4 ? 'medium' : 'high';
}

export const tierOf = (s: { quality: string; autoTier: Tier; effectiveLow: boolean }): Tier =>
  s.quality === 'auto' ? (s.effectiveLow ? 'low' : s.autoTier) : (s.quality as Tier);

/** Current graphics tier: manual choice, or the auto-probed one. */
export const useTier = (): Tier => useApp(tierOf);

/** Navigating on Medium or Low: use the lighter navigation rendering budget. */
export const useNavLight = (): boolean =>
  useApp((s) => (s.nav === 'NAV_FOLLOW' || s.nav === 'NAV_FREE') && tierOf(s) !== 'high');

/** Share of objects kept outside NAV_KEEP_RADIUS_M of the user while navigating on Medium/Low (about 40 % fewer). */
export const NAV_KEEP_RADIUS_M = 150;
export const NAV_KEEP_SHARE = 0.6;
