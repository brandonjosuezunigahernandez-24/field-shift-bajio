// Downloads the real API responses for every fixture point into server/fixtures/.
// Run with: npm run fixtures            (every source)
//      or: npm run fixtures -- --only=power,soilgrids
// The fixtures are raw responses (same format as the cache), never hand-written data.
import { cacheKey } from '../lib/coords.js';
import { writeFixture } from '../lib/cache.js';
import { fetchJson } from '../lib/fetchJson.js';
import { FIXTURE_POINTS } from '../lib/seasons.js';
import { POWER_SOURCE, buildPowerUrl, validatePower } from '../sources/nasaPower.js';
import { SOILCLASS_SOURCE, buildSoilClassUrl, validateSoilClass } from '../sources/soilClass.js';
import { SOILGRIDS_DECIMALS, SOILGRIDS_SOURCE, buildSoilGridsUrl, validateSoilGrids } from '../sources/soilGrids.js';

const sources = [
  { source: POWER_SOURCE, buildUrl: buildPowerUrl, validate: validatePower },
  { source: SOILGRIDS_SOURCE, buildUrl: buildSoilGridsUrl, validate: validateSoilGrids, decimals: SOILGRIDS_DECIMALS },
  { source: SOILCLASS_SOURCE, buildUrl: buildSoilClassUrl, validate: validateSoilClass, decimals: SOILGRIDS_DECIMALS },
];

// --only=a,b keeps just those sources (e.g. to refresh the climate after a new year is published).
const onlyArg = process.argv.find((a) => a.startsWith('--only='));
const only = onlyArg ? onlyArg.slice(7).split(',') : null;

let failed = false;
for (const { lat, lon, nombre } of FIXTURE_POINTS) {
  for (const { source, buildUrl, validate, decimals } of sources) {
    if (only && !only.includes(source)) continue;
    const key = cacheKey(source, lat, lon, decimals);
    const url = buildUrl(lat, lon);
    try {
      const raw = await fetchJson(url, { timeoutMs: 60000 });
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
