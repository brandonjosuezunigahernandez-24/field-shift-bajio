// Globe math shared by the 3D view. Pure functions on plain arrays (no three.js), so they can
// be tested with `node --test`.
//
// Convention: matches three.js SphereGeometry + an equirectangular texture whose left edge is
// longitude -180. North pole on +Y.

const DEG = Math.PI / 180;

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function wrapLon(lon) {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

export const round2 = (v) => Math.round(v * 100) / 100 + 0;

export function latLonToXYZ(lat, lon, r = 1) {
  const phi = (lon + 180) * DEG;
  const theta = (90 - lat) * DEG;
  return [-r * Math.sin(theta) * Math.cos(phi), r * Math.cos(theta), r * Math.sin(theta) * Math.sin(phi)];
}

export function xyzToLatLon([x, y, z]) {
  const r = Math.hypot(x, y, z);
  const lat = 90 - Math.acos(clamp(y / r, -1, 1)) / DEG;
  const lon = wrapLon(Math.atan2(z, -x) / DEG - 180);
  return { lat, lon };
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const normalize = (v) => {
  const n = Math.hypot(...v);
  return [v[0] / n, v[1] / n, v[2] / n];
};

// Local frame on the globe surface: east, up (outward normal) and south, unit vectors.
// (east, up, south) is right-handed, so it maps straight onto three's (x, y, z):
// the parcel diorama is built with x = east, y = up, z = south (north is -z).
export function surfaceFrame(lat, lon) {
  const safeLat = clamp(lat, -89.9, 89.9);
  const up = normalize(latLonToXYZ(safeLat, lon));
  const east = normalize(sub(latLonToXYZ(safeLat, lon + 0.01), latLonToXYZ(safeLat, lon - 0.01)));
  const north = normalize(sub(latLonToXYZ(safeLat + 0.01, lon), latLonToXYZ(safeLat - 0.01, lon)));
  return { east, up, south: [-north[0], -north[1], -north[2]] };
}
