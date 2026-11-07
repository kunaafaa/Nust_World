'use client';
import { useMemo } from 'react';
import { createSearch } from '@/lib/search';
import { useApp } from '@/store/useApp';

/** Places visible to the user (off-campus ones only when the debug toggle is on) plus a search index. */
export function usePlaces() {
  const data = useApp((s) => s.data);
  const showOff = useApp((s) => s.showOffCampus);
  return useMemo(() => {
    const places = (data?.places ?? []).filter((p) => showOff || !p.offCampus);
    return { places, search: createSearch(places) };
  }, [data, showOff]);
}
