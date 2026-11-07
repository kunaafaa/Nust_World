/**
 * Re-fetch OSM from Overpass and write a diff report against the current public/data/nust-full.geojson.
 *   npm run refresh-data            → writes data/raw/nust-full.<timestamp>.geojson and docs/refresh-diff.md
 *   npm run refresh-data -- --apply → also replaces public/data/nust-full.geojson (original kept in data/raw)
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import osmtogeojson from 'osmtogeojson';

const BBOX = '33.630,72.974,33.656,73.008'; // south,west,north,east: campus + margin (the original export's wider box pulled in neighbouring sectors)
const apply = process.argv.includes('--apply');
const query = `[out:json][timeout:240];
(
  nwr["building"](${BBOX}); nwr["highway"](${BBOX}); nwr["amenity"](${BBOX}); nwr["leisure"](${BBOX});
  nwr["landuse"](${BBOX}); nwr["natural"](${BBOX}); nwr["barrier"](${BBOX}); nwr["tourism"="hostel"](${BBOX});
  nwr["entrance"](${BBOX}); nwr["name"](${BBOX});
);
out body; >; out skel qt;`;

const endpoints = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
async function main() {
  let json: { osm3s?: { timestamp_osm_base?: string }; elements: unknown[] } | null = null;
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
      if (res.ok) {
        json = await res.json();
        break;
      }
      console.log(ep, res.status);
    } catch (e) {
      console.log(ep, (e as Error).message);
    }
  }
  if (!json) {
    console.error('Overpass unavailable. Nothing changed.');
    process.exit(1);
  }

  const gj = osmtogeojson(json as never) as {
    type: string;
    features: {
      id: string;
      properties: Record<string, string>;
      geometry: { coordinates: unknown };
    }[];
    timestamp?: string;
    copyright?: string;
  };
  const stamp = json.osm3s?.timestamp_osm_base ?? new Date().toISOString();
  gj.timestamp = stamp;
  gj.copyright =
    'The data included in this document is from www.openstreetmap.org. The data is made available under ODbL.';

  const sig = (f: { properties: Record<string, string>; geometry: { coordinates: unknown } }) =>
    JSON.stringify([
      Object.entries(f.properties)
        .filter(([k]) => k !== '@id')
        .sort(),
      f.geometry.coordinates,
    ]);
  const old = JSON.parse(readFileSync('public/data/nust-full.geojson', 'utf8')) as typeof gj;
  const oldMap = new Map(old.features.map((f) => [f.id, f]));
  const newMap = new Map(gj.features.map((f) => [f.id, f]));
  const added = [...newMap.keys()].filter((k) => !oldMap.has(k));
  const removed = [...oldMap.keys()].filter((k) => !newMap.has(k));
  const changed = [...newMap.keys()].filter(
    (k) => oldMap.has(k) && sig(oldMap.get(k)!) !== sig(newMap.get(k)!),
  );
  const label = (id: string, m: Map<string, { properties: Record<string, string> }>) =>
    `${id}${m.get(id)?.properties.name ? ' — ' + m.get(id)!.properties.name : ''}`;

  mkdirSync('data/raw', { recursive: true });
  const raw = `data/raw/nust-full.${stamp.replace(/[:]/g, '-')}.geojson`;
  writeFileSync(raw, JSON.stringify(gj));
  writeFileSync(
    'docs/refresh-diff.md',
    `# OSM refresh diff

Fetched ${new Date().toISOString()} · Overpass base timestamp **${stamp}** · previous file timestamp ${old.timestamp ?? '?'}
Features: ${old.features.length} → ${gj.features.length} · **+${added.length}** added · **−${removed.length}** removed · **${changed.length}** changed
${apply ? '**Applied** to public/data/nust-full.geojson.' : 'NOT applied (run with `-- --apply`). New data saved to `' + raw + '`.'}

## Added (named first)
${
  added
    .sort(
      (a, b) => Number(!!newMap.get(b)!.properties.name) - Number(!!newMap.get(a)!.properties.name),
    )
    .slice(0, 60)
    .map((i) => '- ' + label(i, newMap))
    .join('\n') || '_none_'
}

## Removed
${
  removed
    .slice(0, 60)
    .map((i) => '- ' + label(i, oldMap))
    .join('\n') || '_none_'
}

## Changed (tags or geometry)
${
  changed
    .slice(0, 60)
    .map((i) => '- ' + label(i, newMap))
    .join('\n') || '_none_'
}
`,
  );
  if (apply) {
    if (!existsSync('data/raw/nust-full.original.geojson'))
      copyFileSync('public/data/nust-full.geojson', 'data/raw/nust-full.original.geojson');
    copyFileSync(raw, 'public/data/nust-full.geojson');
  }
  console.log({
    old: old.features.length,
    new: gj.features.length,
    added: added.length,
    removed: removed.length,
    changed: changed.length,
    applied: apply,
  });
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
