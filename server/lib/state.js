import { readFileSync } from 'node:fs';

// Which Bajío state a point falls in, with INEGI's official boundaries (scripts/fetch-states.js).
// The SIAP data, the crop list and the season calendar of the engine are only for these two states.
const { estados } = JSON.parse(readFileSync(new URL('../data/estados_bajio.json', import.meta.url), 'utf8'));

// Even-odd rule: the point is inside when a ray going east crosses the ring an odd number of times.
function inRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// A polygon is [outer ring, ...holes].
const inPolygon = (lon, lat, [outer, ...holes]) => inRing(lon, lat, outer) && !holes.some((hole) => inRing(lon, lat, hole));

// 'Guanajuato', 'Querétaro' or null when the point is outside both.
export function stateAt(lat, lon) {
  return estados.find((s) => s.poligonos.some((polygon) => inPolygon(lon, lat, polygon)))?.nombre ?? null;
}
