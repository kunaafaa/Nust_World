/**
 * Fetches roads only (no buildings, no names needed) for a wider "context ring" around the campus boundary.
 * Run: npx tsx scripts/fetch-context-roads.ts   -> data/context-roads.json (raw Overpass, ODbL)
 */
import { writeFileSync } from 'node:fs';
const BBOX = '33.629,72.974,33.659,73.010'; // south,west,north,east: boundary bbox + ~400 m
const query = `[out:json][timeout:120];way["highway"](${BBOX});out geom tags;`;
const endpoints = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];
async function main() {
  for (const ep of endpoints) {
    try {
      const res = await fetch(ep, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'nust-world/1.0',
        },
        body: 'data=' + encodeURIComponent(query),
      });
      if (!res.ok) {
        console.log(ep, res.status);
        continue;
      }
      const j = (await res.json()) as {
        osm3s?: { timestamp_osm_base?: string };
        elements: {
          id: number;
          tags?: Record<string, string>;
          geometry?: { lat: number; lon: number }[];
        }[];
      };
      const ways = j.elements
        .filter((e) => e.geometry)
        .map((e) => ({
          id: e.id,
          hw: e.tags?.highway,
          name: e.tags?.name,
          pts: e.geometry!.map((p) => [+p.lon.toFixed(6), +p.lat.toFixed(6)]),
        }));
      writeFileSync(
        'data/context-roads.json',
        JSON.stringify({ timestamp: j.osm3s?.timestamp_osm_base, bbox: BBOX, ways }),
      );
      console.log(ep, 'ways', ways.length);
      return;
    } catch (e) {
      console.log(ep, String(e).slice(0, 80));
    }
  }
  process.exit(1);
}
void main();
