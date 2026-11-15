/** npm run reviews-seed: write supabase/seed/excluded_places.sql (prayer and medical places). No network. */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { excludedPlaceIds, excludedPlacesSql } from './lib/appPlaces';

const ids = excludedPlaceIds();
const out = path.resolve(__dirname, '..', 'supabase', 'seed', 'excluded_places.sql');
writeFileSync(out, excludedPlacesSql(ids));
console.log(`${ids.length} excluded places -> ${path.relative(process.cwd(), out)}`);
