import { cacheKey } from '../lib/coords.js';
import { readCache, writeCache } from '../lib/cache.js';
import { fetchJson } from '../lib/fetchJson.js';

export const FORECAST_CREDIT = 'Open-Meteo.com (datos CC BY 4.0)';
const FORECAST_DAYS = 7;
const FRESH_HOURS = 3; // dentro de este tiempo se reusa la caché y no se vuelve a llamar a la API

export function buildForecastUrl(lat, lon) {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    daily: 'precipitation_sum,precipitation_probability_max,temperature_2m_max,temperature_2m_min',
    timezone: 'America/Mexico_City',
    forecast_days: String(FORECAST_DAYS),
  });
  return `https://api.open-meteo.com/v1/forecast?${params}`;
}

// Respuesta cruda de Open-Meteo -> un elemento por día. Lanza si la forma no es la esperada.
export function parseForecast(raw) {
  const d = raw?.daily;
  if (!Array.isArray(d?.time) || !Array.isArray(d?.precipitation_sum)) {
    throw new Error('Respuesta inesperada de Open-Meteo');
  }
  return d.time.map((fecha, i) => ({
    fecha,
    lluvia_mm: d.precipitation_sum[i],
    prob_lluvia_pct: d.precipitation_probability_max?.[i] ?? null,
    t_max_c: d.temperature_2m_max?.[i] ?? null,
    t_min_c: d.temperature_2m_min?.[i] ?? null,
  }));
}

// Pronóstico de 7 días. Es un extra: nunca lanza, devuelve null si no hay internet ni caché.
// Orden: caché reciente -> API -> caché vieja (con su fecha) -> null.
export async function getForecast(lat, lon) {
  const key = cacheKey('forecast', lat, lon);
  const cached = await readCache(key);
  const ageHours = cached ? (Date.now() - Date.parse(cached.obtenido)) / 3.6e6 : Infinity;

  if (cached && ageHours < FRESH_HOURS) return { ...cached, origen: 'cache' };

  if (process.env.OFFLINE !== '1') {
    try {
      const raw = await fetchJson(buildForecastUrl(lat, lon), { timeoutMs: 8000 });
      const fresh = { obtenido: new Date().toISOString(), dias: parseForecast(raw) };
      await writeCache(key, fresh);
      return { ...fresh, origen: 'api' };
    } catch (err) {
      console.warn(`[forecast] no se pudo consultar ${lat}, ${lon}: ${err.message}`);
    }
  }
  return cached ? { ...cached, origen: 'cache' } : null;
}
