import { HttpError } from './errors.js';

export function roundTo(value, decimals) {
  const factor = 10 ** decimals;
  // "+ 0" turns -0 into 0 so the cache key never reads "-0.00".
  return Math.round(value * factor) / factor + 0;
}

function toNumber(value) {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string' || value.trim() === '') return NaN;
  return Number(value);
}

// Accepts { lat, lon } from a query string or a JSON body.
// Returns them as given: each source rounds once to its own resolution in loadRaw (climate 2, soil 3).
// Rounding here too would shift points twice (20.4749 -> 20.475 -> 20.48 instead of 20.47).
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
  return { lat, lon };
}

// File name (without extension) shared by cache and fixtures: <source>_<lat>_<lon>, `decimals` digits each.
export function cacheKey(source, lat, lon, decimals = 2) {
  return `${source}_${roundTo(lat, decimals).toFixed(decimals)}_${roundTo(lon, decimals).toFixed(decimals)}`;
}
