// Downloads the real API responses for every fixture point into server/fixtures/.
// Run with: npm run fixtures            (every source)
//      or: npm run fixtures -- --only=power,soilgrids
// The fixtures are raw responses (same format as the cache), never hand-written data.
import { cacheKey } from '../lib/coords.js';
import { writeFixture } from '../lib/cache.js';
import { fetchJson } from '../lib/fetchJson.js';
import { FIXTURE_POINTS } from '../lib/seasons.js';
import { POWER_SOURCE, buildPowerUrl, validatePower } from '../sources/nasaPower.js';
import { SOILGRIDS_DECIMALS, SOILGRIDS_SOURCE, buildSoilGridsUrl, validateSoilGrids } from '../sources/soilGrids.js';
import { TERRAIN_DECIMALS, TERRAIN_SOURCE, fetchTerrainGrid, validateTerrain } from '../sources/terrain.js';

// Each source gives `buildUrl(lat, lon)` for a JSON API or `fetcher(lat, lon)`, like loadRaw.
const sources = [
  { source: POWER_SOURCE, buildUrl: buildPowerUrl, validate: validatePower },
  { source: SOILGRIDS_SOURCE, buildUrl: buildSoilGridsUrl, validate: validateSoilGrids, decimals: SOILGRIDS_DECIMALS },
  {
    source: TERRAIN_SOURCE,
    fetcher: (lat, lon) => fetchTerrainGrid(lat, lon, { timeoutMs: 60000 }),
    validate: validateTerrain,
    decimals: TERRAIN_DECIMALS,
  },
];

// --only=a,b keeps just those sources (e.g. to refresh the climate after a new year is published).
const onlyArg = process.argv.find((a) => a.startsWith('--only='));
const only = onlyArg ? onlyArg.slice(7).split(',') : null;

let failed = false;
for (const { lat, lon, nombre } of FIXTURE_POINTS) {
  for (const { source, buildUrl, fetcher, validate, decimals } of sources) {
    if (only && !only.includes(source)) continue;
    const key = cacheKey(source, lat, lon, decimals);
    const url = buildUrl?.(lat, lon) ?? source;
    try {
      const raw = fetcher ? await fetcher(lat, lon) : await fetchJson(url, { timeoutMs: 60000 });
      validate(raw);
      await writeFixture(key, raw);
      console.log(`OK   fixtures/${key}.json  (${nombre})`);
    } catch (err) {
      failed = true;
      console.error(`FAIL ${source} (${nombre}): ${err.message}\n     ${url}`);
    }
  }
}
process.exitCode = failed ? 1 : 0;
