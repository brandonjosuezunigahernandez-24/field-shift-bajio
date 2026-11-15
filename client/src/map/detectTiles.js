// Browser side of "tap to detect": gets the satellite photo and the street layer around the tap,
// runs detectRegion (detect.js) and returns the parcel outline as [lon, lat] corners.
import { DEFAULT_TOLERANCE, detectRegion } from './detect.js';

export { DEFAULT_TOLERANCE };

const ZOOM = 17; // ~1.1 m per pixel in the Bajío: field ridges and tracks are visible
const TILE = 256;
const SPAN = 3; // 3 x 3 tiles: ~860 m per side around the tap

// Roads come from the same street layer the map shows, but read at zoom 15: from zoom 16 in, Esri
// only draws the street NAMES, not the lines (checked on the real tiles). One zoom-15 pixel covers
// 4 x 4 pixels of the photo.
const ROADS_ZOOM = 15;
const ROADS_SCALE = 2 ** (ZOOM - ROADS_ZOOM);
const ROADS_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/15/{y}/{x}';

function lonLatToTile(lon, lat) {
  const n = 2 ** ZOOM;
  const rad = (lat * Math.PI) / 180;
  return { x: ((lon + 180) / 360) * n, y: ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n };
}

function tileToLonLat(x, y) {
  const n = 2 ** ZOOM;
  return [(x / n) * 360 - 180, (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI];
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous'; // needed to read the pixels back
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(url));
    img.src = url;
  });
}

const fill = (template, x, y) => template.replace('{z}', ZOOM).replace('{x}', x).replace('{y}', y);

// One canvas with the 3 x 3 tiles of `template`. Missing tiles (e.g. no roads there) stay empty
// when `optional` is set.
async function mosaic(template, x0, y0, optional = false) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = TILE * SPAN;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const jobs = [];
  for (let dy = 0; dy < SPAN; dy++) {
    for (let dx = 0; dx < SPAN; dx++) {
      jobs.push(
        loadImage(fill(template, x0 + dx, y0 + dy)).then(
          (img) => ctx.drawImage(img, dx * TILE, dy * TILE),
          (err) => {
            if (!optional) throw err;
          }
        )
      );
    }
  }
  await Promise.all(jobs);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

// 1 where the street layer draws a road line over the 3 x 3 block. Road lines are tan or orange
// (warm, mid brightness); most of the label text (black with a pale halo) is left out by color.
// Some label pixels still pass: they sit along the roads, so they rarely cut a field.
async function roadMask(x0, y0) {
  const size = TILE * SPAN;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = false;
  const jobs = [];
  for (let ty = Math.floor(y0 / ROADS_SCALE); ty <= Math.floor((y0 + SPAN - 1) / ROADS_SCALE); ty++) {
    for (let tx = Math.floor(x0 / ROADS_SCALE); tx <= Math.floor((x0 + SPAN - 1) / ROADS_SCALE); tx++) {
      const url = ROADS_URL.replace('{x}', tx).replace('{y}', ty);
      jobs.push(
        loadImage(url).then(
          (img) => ctx.drawImage(img, (tx * ROADS_SCALE - x0) * TILE, (ty * ROADS_SCALE - y0) * TILE, TILE * ROADS_SCALE, TILE * ROADS_SCALE),
          () => {} // no street tile there: no roads known, the photo's own edges still apply
        )
      );
    }
  }
  await Promise.all(jobs);
  const px = ctx.getImageData(0, 0, size, size).data;
  const roads = new Uint8Array(size * size);
  for (let i = 0; i < roads.length; i++) {
    const r = px[i * 4];
    const g = px[i * 4 + 1];
    const b = px[i * 4 + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    roads[i] = px[i * 4 + 3] > 128 && lum > 90 && lum < 237 && r > b + 20 ? 1 : 0;
  }
  return roads;
}

// Photo + roads around a point. Cached per tile block, so "Más chica / Más grande" re-run at once.
const cache = new Map();
function loadArea(lon, lat, imageryUrl) {
  const t = lonLatToTile(lon, lat);
  const x0 = Math.floor(t.x) - 1;
  const y0 = Math.floor(t.y) - 1;
  const key = `${imageryUrl}:${x0}:${y0}`;
  if (!cache.has(key)) {
    const job = Promise.all([mosaic(imageryUrl, x0, y0), roadMask(x0, y0)]).then(([photo, roads]) => ({ photo, roads, x0, y0 }));
    job.catch(() => cache.delete(key));
    cache.set(key, job);
    if (cache.size > 6) cache.delete(cache.keys().next().value);
  }
  return cache.get(key);
}

const REASONS = {
  camino: 'Tocaste un camino. Toca dentro de la parcela.',
  chica: 'No encontramos una parcela en ese punto. Toca más al centro o usa «Más grande».',
  fuera: 'Toca más cerca del centro del mapa.',
};

// Detects the parcel around (lon, lat). imageryUrl: the tile template of the photo to analyze.
// Returns { ok, corners: [[lon, lat], ...], leaked } or { ok: false, message }.
export async function detectParcelAt({ lon, lat, imageryUrl, tolerance = DEFAULT_TOLERANCE }) {
  let area;
  try {
    area = await loadArea(lon, lat, imageryUrl);
  } catch {
    return { ok: false, message: 'No pudimos bajar la imagen para analizarla. Revisa tu conexión e intenta de nuevo.' };
  }
  const { photo, roads, x0, y0 } = area;
  const t = lonLatToTile(lon, lat);
  const result = detectRegion({
    data: photo.data,
    width: photo.width,
    height: photo.height,
    roads,
    seedX: (t.x - x0) * TILE,
    seedY: (t.y - y0) * TILE,
    tolerance,
  });
  if (!result.ok) return { ok: false, message: REASONS[result.reason] ?? REASONS.chica };
  const corners = result.ring.map(([px, py]) => tileToLonLat(x0 + (px + 0.5) / TILE, y0 + (py + 0.5) / TILE));
  return { ok: true, corners, leaked: result.leaked };
}
