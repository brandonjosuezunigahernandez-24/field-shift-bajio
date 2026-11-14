import { cacheKey } from './coords.js';
import { readCache, readFixture, writeCache } from './cache.js';
import { fetchJson } from './fetchJson.js';
import { HttpError } from './errors.js';
import { DEMO_POINT } from './seasons.js';

// Gets the raw response of an external API for one point.
// Order: disk cache -> live API -> committed fixture -> 502.
// `validate(raw)` must throw when the response is not usable, so bad payloads are never cached.
// Set OFFLINE=1 to skip the network (demo rehearsal without internet).
export async function loadRaw({ source, label, lat, lon, url, timeoutMs, validate }) {
  const key = cacheKey(source, lat, lon);

  const cached = await readCache(key);
  if (cached) return { raw: cached, origen: 'cache' };

  if (process.env.OFFLINE !== '1') {
    try {
      const raw = await fetchJson(url, { timeoutMs });
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
