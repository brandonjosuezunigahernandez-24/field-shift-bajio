// Downloads the real API responses for the demo point into server/fixtures/.
// Run with: npm run fixtures
// The fixtures are raw responses (same format as the cache), never hand-written data.
import { cacheKey } from '../lib/coords.js';
import { writeFixture } from '../lib/cache.js';
import { fetchJson } from '../lib/fetchJson.js';
import { DEMO_POINT } from '../lib/seasons.js';
import { POWER_SOURCE, buildPowerUrl, validatePower } from '../sources/nasaPower.js';
import { SOILGRIDS_DECIMALS, SOILGRIDS_SOURCE, buildSoilGridsUrl, validateSoilGrids } from '../sources/soilGrids.js';

const { lat, lon, nombre } = DEMO_POINT;

const jobs = [
  { source: POWER_SOURCE, url: buildPowerUrl(lat, lon), validate: validatePower, timeoutMs: 60000 },
  {
    source: SOILGRIDS_SOURCE,
    url: buildSoilGridsUrl(lat, lon),
    validate: validateSoilGrids,
    timeoutMs: 60000,
    decimals: SOILGRIDS_DECIMALS,
  },
];

let failed = false;
for (const { source, url, validate, timeoutMs, decimals } of jobs) {
  const key = cacheKey(source, lat, lon, decimals);
  try {
    const raw = await fetchJson(url, { timeoutMs });
    validate(raw);
    await writeFixture(key, raw);
    console.log(`OK   fixtures/${key}.json  (${nombre})`);
  } catch (err) {
    failed = true;
    console.error(`FAIL ${source}: ${err.message}\n     ${url}`);
  }
}
process.exitCode = failed ? 1 : 0;
