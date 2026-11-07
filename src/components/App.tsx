'use client';
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { landmarks } from '@/data/landmarks';
import { useLocationLifecycle } from '@/hooks/useLocation';
import { useRouter } from '@/hooks/useRouter';
import { buildCampus } from '@/lib/campus';
import { Terrain, type TerrainFile } from '@/lib/terrain';
import { applyBoundary } from '@/lib/cleanup';
import { parseBoundary, parseContext, type ContextFile } from '@/lib/context';
import { applyTopoMerge, type TopoMergeFile, type TopoTreesFile } from '@/lib/topoMerge';
import type { RawOsm } from '@/lib/osm';
import { setTerrainOn, useApp } from '@/store/useApp';
import { CategoryChips } from './CategoryChips';
import { About, Footer, LocateButton, Title } from './Chrome';
import { ListView, NearestBar, Onboarding, ScreenshotBar, SettingsPanel, Tour } from './Extras';
import { Controls, DebugBar, DebugToggleMobile, Loading, Toast } from './Hud';
import { InfoCard } from './InfoCard';
import { LabelLayer } from './LabelLayer';
import { Map2D, SceneBoundary, hasWebGL } from './Map2D';
import { RoutePanel } from './RoutePanel';
import { SearchBar } from './SearchBar';

const CampusScene = dynamic(() => import('@/scene/CampusScene'), { ssr: false });

async function getJson<T = RawOsm>(url: string): Promise<T | undefined> {
  try {
    const r = await fetch(url);
    return r.ok ? ((await r.json()) as T) : undefined;
  } catch {
    return undefined;
  }
}

export default function App() {
  const data = useApp((s) => s.data);
  const phase = useApp((s) => s.phase);
  const shot = useApp((s) => s.screenshot);
  const [gl, setGl] = useState(true);
  // Reads browser-only capabilities after mount so server and client markup match (hydration-safe).
  useEffect(
    // eslint-disable-next-line react-hooks/set-state-in-effect
    () => setGl(hasWebGL() && new URLSearchParams(location.search).get('flat') !== '1'),
    [],
  );
  useRouter();
  useLocationLifecycle();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const debug = params.get('debug') === '1';
    const low = params.get('low') === '1';
    useApp.setState({
      debug,
      progress: 0.1,
      ...(low ? { quality: 'low' as const, effectiveLow: true } : {}),
    });
    try {
      useApp.setState({
        visited: JSON.parse(localStorage.getItem('nw-visited') ?? '[]'),
        found: JSON.parse(localStorage.getItem('nw-found') ?? '[]'),
      });
    } catch {
      /* ignore */
    }
    (async () => {
      const topoOff = params.get('topo') === 'off';
      const [osm, merge, trees, terrain, bnd, ctx] = await Promise.all([
        getJson('/data/nust-full.geojson'),
        topoOff ? undefined : getJson<TopoMergeFile>('/data/topo-merge.json'),
        topoOff ? undefined : getJson<TopoTreesFile>('/data/topo-trees.json'),
        getJson<TerrainFile>('/data/topo-terrain.json'),
        getJson<never>('/data/campus-boundary.geojson'),
        getJson<ContextFile>('/data/context-roads.json'),
      ]);
      useApp.setState({ progress: 0.6 });
      if (!osm) return useApp.setState({ toast: 'Could not load campus data' });
      // OSM first; the topo merge (Overture, trees) is applied on top and is entirely optional: if its files are
      // missing the map is exactly the OSM map.
      const base = buildCampus({ osm, landmarks });
      const merged = applyTopoMerge(base, merge ?? null, trees ?? null);
      // Production edge: clip to the campus boundary (+30 m), clean polygons, and add the faded road context ring.
      const ring = bnd && params.get('edge') !== 'off' ? parseBoundary(bnd) : null; // ?edge=off = old hard-cut look, for comparison
      const { data: clipped } = applyBoundary(merged, ring);
      const campus = Object.assign(clipped, { topoReport: merged.topoReport });
      useApp.setState({ contextRoads: ctx && ring ? parseContext(ctx) : [] });
      useApp.setState({ terrain: terrain ? new Terrain(terrain) : null });
      if (terrain && params.get('terrain') === '1') setTerrainOn(true); // shareable: ?terrain=1
      if (campus.topoReport) {
        useApp.setState({ topoReport: campus.topoReport });
        console.info('[NUST World] topo merge', campus.topoReport);
      }
      const r = campus.report;
      console.info(
        `[NUST World] landmarks=${r.landmarks} matched=${r.matched} noFootprint=${r.noFootprint.length} ` +
          `footprintsWithoutLandmark=${r.footprintsWithoutLandmark.length} extraPlaces=${r.extraPlaces}`,
      );
      if (debug)
        console.info('[NUST World] footprints without landmark:', r.footprintsWithoutLandmark);
      const place = params.get('place');
      let seen = false;
      try {
        seen = sessionStorage.getItem('nw-title') === '1';
      } catch {
        /* ignore */
      }
      // Deep links, ?debug and screenshots skip the title; otherwise it plays once per session.
      const skipTitle =
        seen ||
        !!place ||
        params.has('from') ||
        params.has('to') ||
        debug ||
        params.has('simulate');
      useApp.setState({ data: campus, progress: 1, phase: skipTitle ? 'explore' : 'title' });
      if (place && campus.places.some((p) => p.id === place))
        setTimeout(() => useApp.getState().select(place), 600);
    })();
  }, []);

  // Keep ?place= in the URL so any selection is shareable.
  const selectedId = useApp((s) => s.selectedId);
  useEffect(() => {
    if (phase !== 'explore') return;
    const u = new URL(location.href);
    if (selectedId) u.searchParams.set('place', selectedId);
    else u.searchParams.delete('place');
    history.replaceState(null, '', u);
  }, [selectedId, phase]);

  return (
    <main className="fixed inset-0 overflow-hidden bg-[#0b1020]">
      {data &&
        (gl ? (
          <SceneBoundary data={data}>
            <CampusScene data={data} />
          </SceneBoundary>
        ) : (
          <Map2D data={data} />
        ))}
      {data && gl && <LabelLayer />}
      <Title />
      {phase === 'explore' && !shot && (
        <>
          <LocateButton />
          <NearestBar />
          <SettingsPanel />
          <Tour />
          <Onboarding />
          <header className="absolute inset-x-0 top-0 z-20 mx-auto flex max-w-xl flex-col gap-2 px-3 pt-[calc(0.75rem+var(--sat))] md:left-4 md:right-auto md:mx-0 md:w-[380px] md:px-0">
            <SearchBar />
            <CategoryChips />
          </header>
          <Controls />
          <InfoCard />
          <RoutePanel />
          <DebugBar />
          <DebugToggleMobile />
        </>
      )}
      {data && phase !== 'loading' && <Footer />}
      <About />
      <ListView />
      <ScreenshotBar />
      <Toast />
      <Loading />
    </main>
  );
}
