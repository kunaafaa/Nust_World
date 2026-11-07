/** Footprint length, width, area and orientation for every building → data/dimensions.json. Run: npm run dimensions */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { landmarks } from '../src/data/landmarks';
import { buildCampus } from '../src/lib/campus';
import { orientedBox, polygonArea } from '../src/lib/geo';
import type { RawOsm } from '../src/lib/osm';

const data = buildCampus({
  osm: JSON.parse(readFileSync('public/data/nust-full.geojson', 'utf8')) as RawOsm,
  landmarks,
});
const out: Record<string, unknown> = {};
for (const b of data.buildings) {
  const box = orientedBox(b.footprint);
  const holes = b.holes.reduce((a, h) => a + Math.abs(polygonArea(h)), 0);
  out[b.id] = {
    name: b.name ?? null,
    osmId: b.osmId,
    lengthM: +box.length.toFixed(1),
    widthM: +box.width.toFixed(1),
    areaM2: +(Math.abs(polygonArea(b.footprint)) - holes).toFixed(1),
    /** Long-axis bearing, degrees clockwise from north, 0..180 */
    orientationDeg: +(
      ((Math.atan2(Math.cos(box.angle), -Math.sin(box.angle)) * 180) / Math.PI + 180) %
      180
    ).toFixed(1),
    provisional: b.provisional ?? false,
  };
}
mkdirSync('data', { recursive: true });
writeFileSync('data/dimensions.json', JSON.stringify(out, null, 1));
console.log('wrote data/dimensions.json for', Object.keys(out).length, 'buildings');
