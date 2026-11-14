// Downloads the real API responses for the demo point into server/fixtures/.
// Run with: npm run fixtures
// The fixtures are real responses (same format as the cache), never hand-written data.
import { cacheKey } from '../lib/coords.js';
import { writeFixture } from '../lib/cache.js';
import { fetchJson } from '../lib/fetchJson.js';
import { DEMO_POINT } from '../lib/seasons.js';
import { POWER_SOURCE, buildPowerUrl, validatePower } from '../sources/nasaPower.js';
import { SOILGRIDS_SOURCE, buildSoilGridsUrl, validateSoilGrids } from '../sources/soilGrids.js';
import { TERRAIN_SOURCE, fetchTerrainGrid, validateTerrain } from '../sources/terrain.js';

const { lat, lon, nombre } = DEMO_POINT;
const timeoutMs = 60000;

const jobs = [
  { source: POWER_SOURCE, fetch: () => fetchJson(buildPowerUrl(lat, lon), { timeoutMs }), validate: validatePower },
  {
    source: SOILGRIDS_SOURCE,
    fetch: () => fetchJson(buildSoilGridsUrl(lat, lon), { timeoutMs }),
    validate: validateSoilGrids,
  },
  { source: TERRAIN_SOURCE, fetch: () => fetchTerrainGrid(lat, lon, { timeoutMs }), validate: validateTerrain },
];

// Pass source names to refresh only those, e.g. `npm run fixtures -- terrain`.
const only = process.argv.slice(2);
let failed = false;
for (const { source, fetch, validate } of jobs) {
  if (only.length && !only.includes(source)) continue;
  const key = cacheKey(source, lat, lon);
  try {
    const raw = await fetch();
    validate(raw);
    await writeFixture(key, raw);
    console.log(`OK   fixtures/${key}.json  (${nombre})`);
  } catch (err) {
    failed = true;
    console.error(`FAIL ${source}: ${err.message}`);
  }
}
process.exitCode = failed ? 1 : 0;
