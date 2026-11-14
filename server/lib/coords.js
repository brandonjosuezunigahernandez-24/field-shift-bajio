import { HttpError } from './errors.js';

export function roundTo(value, decimals) {
  const f = 10 ** decimals;
  // "+ 0" turns -0 into 0 so the cache key never reads "-0.00".
  return Math.round(value * f) / f + 0;
}

export const round2 = (value) => roundTo(value, 2);

function toNumber(value) {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string' || value.trim() === '') return NaN;
  return Number(value);
}

// Accepts { lat, lon } from a query string or a JSON body.
// Returns both rounded to 2 decimals (about 1 km), which is also the cache resolution.
// /api/terreno asks for 3 decimals (~110 m): its 1 km block must be centered on the parcel.
export function parseCoords(input, { decimals = 2 } = {}) {
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
  return { lat: roundTo(lat, decimals), lon: roundTo(lon, decimals) };
}

// File name (without extension) shared by cache and fixtures: <source>_<lat2>_<lon2>
// (terrain uses 3 decimals: <source>_<lat3>_<lon3>).
export function cacheKey(source, lat, lon, decimals = 2) {
  return `${source}_${roundTo(lat, decimals).toFixed(decimals)}_${roundTo(lon, decimals).toFixed(decimals)}`;
}
