import { cacheKey, roundTo } from './coords.js';
import { readCache, readFixture, writeCache } from './cache.js';
import { fetchJson } from './fetchJson.js';
import { HttpError } from './errors.js';
import { DEMO_POINT } from './seasons.js';

// Gets the raw response of an external API for one point.
// Order: disk cache -> live API -> committed fixture -> 502.
// `validate(raw)` must throw when the response is not usable, so bad payloads are never cached
// and stale cache files are downloaded again.
// `decimals` is the source's resolution: the point is rounded once, so the URL and the cache key always match.
// Pass `buildUrl(lat, lon)` for a plain JSON API, or `fetcher(lat, lon)` (async, returns the data to cache)
// when the source needs several requests or binary files (e.g. elevation tiles for /api/terreno).
// `isStale(raw)` (optional) returns a reason when a usable cache is out of date (e.g. a new year
// was published): it is downloaded again, and kept as the answer if the network fails.
// Set OFFLINE=1 to skip the network (demo rehearsal without internet).
export async function loadRaw({ source, label, lat, lon, decimals = 2, buildUrl, fetcher, timeoutMs, validate, isStale }) {
  lat = roundTo(lat, decimals);
  lon = roundTo(lon, decimals);
  const key = cacheKey(source, lat, lon, decimals);

  const cached = await readCache(key);
  let stale = null;
  if (cached) {
    try {
      validate?.(cached);
      const reason = isStale?.(cached);
      if (!reason) return { raw: cached, origen: 'cache' };
      stale = cached;
      console.warn(`[${source}] caché desactualizada en ${key} (${reason}), se intenta actualizar`);
    } catch (err) {
      // Saved by an older version of the query (e.g. fewer parameters): download it again.
      console.warn(`[${source}] caché vieja en ${key}, se vuelve a descargar: ${err.message}`);
    }
  }

  if (process.env.OFFLINE !== '1') {
    // Two tries: SoilGrids drops about 1 call in 5 and only the demo point has a fixture.
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const raw = fetcher ? await fetcher(lat, lon) : await fetchJson(buildUrl(lat, lon), { timeoutMs });
        validate?.(raw);
        await writeCache(key, raw);
        return { raw, origen: 'api' };
      } catch (err) {
        console.warn(`[${source}] intento ${attempt} de 2, no se pudo consultar ${lat}, ${lon}: ${err.message}`);
      }
    }
  }

  // Out of date beats nothing: without internet the old cache still answers.
  if (stale) return { raw: stale, origen: 'cache' };

  const fixture = await readFixture(key);
  if (fixture) return { raw: fixture, origen: 'fixture' };

  throw new HttpError(
    502,
    `No pudimos consultar ${label} para esta parcela. Revisa tu conexión e intenta de nuevo, ` +
      `o prueba con el ejemplo de ${DEMO_POINT.nombre}`
  );
}
