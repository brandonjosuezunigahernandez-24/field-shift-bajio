// Parcel outline helpers. Pure functions, no map library, tested with `node --test`.
// A parcel outline is an array of [lon, lat] corners (GeoJSON order), without repeating the first.

const M_PER_DEG_LAT = 111320;

// Center sent to the API: the average of the corners (docs/api-contract.md, "Selección de la
// parcela"). The server rounds to 2 decimals (~1 km), so a true centroid would not change anything.
export function polygonCenter(corners) {
  const lon = corners.reduce((s, c) => s + c[0], 0) / corners.length;
  const lat = corners.reduce((s, c) => s + c[1], 0) / corners.length;
  return { lat, lon };
}

// Corners -> meters east / north of (lat0, lon0). Flat-earth approximation: fine for a field.
export function toMeters(corners, lat0, lon0) {
  const mPerDegLon = M_PER_DEG_LAT * Math.cos((lat0 * Math.PI) / 180);
  return corners.map(([lon, lat]) => [(lon - lon0) * mPerDegLon, (lat - lat0) * M_PER_DEG_LAT]);
}

export function areaHectares(corners) {
  if (corners.length < 3) return 0;
  const { lat, lon } = polygonCenter(corners);
  const pts = toMeters(corners, lat, lon);
  let twice = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    twice += x1 * y2 - x2 * y1;
  }
  return Math.abs(twice) / 2 / 10000;
}

export function bounds(corners) {
  const lons = corners.map((c) => c[0]);
  const lats = corners.map((c) => c[1]);
  return [
    [Math.min(...lons), Math.min(...lats)],
    [Math.max(...lons), Math.max(...lats)],
  ];
}

// Ray casting. `pt` and `poly` in the same 2D coordinates.
export function pointInPolygon([x, y], poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Corners -> diorama local units: x = east, z = south, 1 unit = sideM meters.
export function toDiorama(corners, lat0, lon0, sideM = 1000) {
  return toMeters(corners, lat0, lon0).map(([east, north]) => [east / sideM, -north / sideM]);
}

// GeoJSON for the map: the polygon (when it has 3+ corners) and its corners as points.
export function outlineGeoJSON(corners) {
  const features = corners.map((c, i) => ({
    type: 'Feature',
    properties: { index: i },
    geometry: { type: 'Point', coordinates: c },
  }));
  if (corners.length >= 3) {
    features.push({
      type: 'Feature',
      properties: {},
      geometry: { type: 'Polygon', coordinates: [[...corners, corners[0]]] },
    });
  } else if (corners.length === 2) {
    features.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: corners } });
  }
  return { type: 'FeatureCollection', features };
}

// Straight-line distance in meters between two [lon, lat] points (flat-earth, fine under ~10 km).
export function distanceMeters(a, b) {
  const [[dx, dy]] = toMeters([b], a[1], a[0]);
  return Math.hypot(dx, dy);
}

export const GPS_MAX_ACCURACY_M = 30; // worse than this, a corner would land in the neighbor's field
export const GPS_MIN_STEP_M = 5; // closer than this to the previous corner, it is the same corner

// Can the farmer's current GPS position be the next corner? Returns { ok, code, message } in Spanish.
// code: 'sin-gps' | 'senal-debil' | 'misma-esquina' (normal right after marking: not an error).
// gps: { lon, lat, accuracy } (accuracy in meters, 95%), corners: [[lon, lat], ...] so far.
export function checkGpsCorner(gps, corners) {
  if (!gps) return { ok: false, code: 'sin-gps', message: 'Todavía no tenemos tu ubicación.' };
  if (gps.accuracy > GPS_MAX_ACCURACY_M) {
    return {
      ok: false,
      code: 'senal-debil',
      message: `La señal del GPS es débil (±${Math.round(gps.accuracy)} m). Sal a cielo abierto y espera unos segundos.`,
    };
  }
  const last = corners.at(-1);
  if (last && distanceMeters(last, [gps.lon, gps.lat]) < GPS_MIN_STEP_M) {
    return {
      ok: false,
      code: 'misma-esquina',
      message: `Esquina ${corners.length} marcada. Camina a la siguiente esquina, siguiendo la orilla.`,
    };
  }
  return { ok: true, code: null, message: null };
}
