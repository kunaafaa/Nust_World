import type { MetadataRoute } from 'next';
import { landmarks } from '@/data/landmarks';

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://nust-world.vercel.app';

/** One URL per on-campus landmark (deep link ?place=<id>) so each building is indexable. */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const places = landmarks
    .filter((l) => !l.offCampus && !/^\d+$/.test(l.name) && l.id !== 'sada-walon-ki-jhoprian-7994')
    .map((l) => ({
      url: `${SITE}/?place=${encodeURIComponent(l.id)}`,
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    }));
  return [{ url: SITE, lastModified: now, changeFrequency: 'weekly', priority: 1 }, ...places];
}
