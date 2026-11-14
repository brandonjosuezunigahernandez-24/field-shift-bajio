// Downloads the real API responses for every fixture point into server/fixtures/.
// Run with: npm run fixtures
// The fixtures are raw responses (same format as the cache), never hand-written data.
import { cacheKey } from '../lib/coords.js';
import { writeFixture } from '../lib/cache.js';
import { fetchJson } from '../lib/fetchJson.js';
import { FIXTURE_POINTS } from '../lib/seasons.js';
import { POWER_SOURCE, buildPowerUrl, validatePower } from '../sources/nasaPower.js';
import { SOILGRIDS_SOURCE, buildSoilGridsUrl, validateSoilGrids } from '../sources/soilGrids.js';

const sources = [
  { source: POWER_SOURCE, buildUrl: buildPowerUrl, validate: validatePower },
  { source: SOILGRIDS_SOURCE, buildUrl: buildSoilGridsUrl, validate: validateSoilGrids },
];

let failed = false;
for (const { lat, lon, nombre } of FIXTURE_POINTS) {
  for (const { source, buildUrl, validate } of sources) {
    const key = cacheKey(source, lat, lon);
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
