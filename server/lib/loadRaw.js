import { cacheKey } from './coords.js';
import { readCache, readFixture, writeCache } from './cache.js';
import { fetchJson } from './fetchJson.js';
import { HttpError } from './errors.js';
import { DEMO_POINT } from './seasons.js';

// Gets the response of an external API for one point.
// Order: disk cache -> live API -> committed fixture -> 502.
// Pass `url` for a plain JSON API, or `fetcher` (async () => data) when the source needs
// several requests or binary files (e.g. elevation tiles); what it returns is what gets cached.
// `validate(raw)` must throw when the response is not usable, so bad payloads are never cached.
// Set OFFLINE=1 to skip the network (demo rehearsal without internet).
export async function loadRaw({ source, label, lat, lon, url, fetcher, timeoutMs, validate, decimals = 2 }) {
  const key = cacheKey(source, lat, lon, decimals);

  const cached = await readCache(key);
  if (cached) return { raw: cached, origen: 'cache' };

  if (process.env.OFFLINE !== '1') {
    try {
      const raw = fetcher ? await fetcher() : await fetchJson(url, { timeoutMs });
      validate?.(raw);
      await writeCache(key, raw);
      return { raw, origen: 'api' };
    } catch (err) {
      console.warn(`[${source}] no se pudo consultar ${lat}, ${lon}: ${err.message}`);
    }
  }

  const fixture = await readFixture(key);
  if (fixture) return { raw: fixture, origen: 'fixture' };

  throw new HttpError(
    502,
    `No pudimos consultar ${label} para esta parcela. Revisa tu conexión e intenta de nuevo, ` +
      `o prueba con el ejemplo de ${DEMO_POINT.nombre}`
  );
}
