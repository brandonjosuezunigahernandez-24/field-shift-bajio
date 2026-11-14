import { HttpError } from './errors.js';

export function round2(value) {
  // "+ 0" turns -0 into 0 so the cache key never reads "-0.00".
  return Math.round(value * 100) / 100 + 0;
}

function toNumber(value) {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string' || value.trim() === '') return NaN;
  return Number(value);
}

// Accepts { lat, lon } from a query string or a JSON body.
// Returns both rounded to 2 decimals (about 1 km), which is also the cache resolution.
export function parseCoords(input) {
  const lat = toNumber(input?.lat);
  const lon = toNumber(input?.lon);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new HttpError(400, 'Faltan la latitud y la longitud de la parcela (lat y lon deben ser números).');
  }
  if (lat < -90 || lat > 90) {
    throw new HttpError(400, 'La latitud debe estar entre -90 y 90.');
  }
  if (lon < -180 || lon > 180) {
    throw new HttpError(400, 'La longitud debe estar entre -180 y 180.');
  }
  return { lat: round2(lat), lon: round2(lon) };
}

// File name (without extension) shared by cache and fixtures: <source>_<lat2>_<lon2>
export function cacheKey(source, lat, lon) {
  return `${source}_${round2(lat).toFixed(2)}_${round2(lon).toFixed(2)}`;
}
