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
